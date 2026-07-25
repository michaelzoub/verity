import { createPublicClient, defineChain, http, keccak256, parseEventLogs, stringToHex } from "viem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SupabaseStore } from "@verity/adapters";

const required = [
  "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_GRADERS_BUCKET",
  "SUPABASE_SUBMISSIONS_BUCKET", "SUPABASE_ARTIFACTS_BUCKET", "RPC_URL", "CHAIN_ID",
  "INDEXER_CONFIRMATIONS", "INDEXER_INTERVAL_MS",
];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (Number(process.env.CHAIN_ID) !== 10143) throw new Error("Indexer requires Monad Testnet chain id 10143");

const rpcUrl = process.env.RPC_URL!;
const chain = defineChain({
  id: 10143, name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const artifact = JSON.parse(readFileSync(resolve(process.cwd(), "../../artifacts/contracts/ChallengeEscrow.json"), "utf8"));
const store = new SupabaseStore();
const confirmations = BigInt(process.env.INDEXER_CONFIRMATIONS!);
const client = createPublicClient({ chain, transport: http(rpcUrl) });

async function tick() {
  await store.load();
  const latest = await client.getBlockNumber();
  const confirmed = latest > confirmations ? latest - confirmations : 0n;
  for (const challenge of store.challenges.values()) {
    if (!challenge.contractAddress || challenge.deploymentBlock === undefined) continue;
    const address = challenge.contractAddress as `0x${string}`;
    const from = BigInt(challenge.deploymentBlock);
    const key = `${chain.id}:${address}`;
    const checkpoint = await store.get(key);
    if (checkpoint?.blockHash && checkpoint.blockHash !== "reorg-reset") {
      const canonical = await client.getBlock({ blockNumber: BigInt(checkpoint.blockNumber) });
      if (canonical.hash !== checkpoint.blockHash) {
        challenge.indexed = false; challenge.status = "funding"; challenge.paid = false;
        challenge.refunded = false; challenge.refundedTransactionHash = undefined; challenge.submissions = 0;
        const affected = [...store.submissions.values()].filter(submission => submission.challengeId === challenge.id && submission.finalizedEventId);
        for (const submission of affected) {
          submission.finalizedEventId = undefined;
          submission.status = submission.transactionHash ? "SETTLEMENT_PENDING" : "GRADED";
        }
        await store.resetIndexerProjection(address, challenge, affected);
        await store.put(key, {
          chainId: chain.id, contractAddress: address, blockNumber: Number(from) - 1,
          blockHash: "reorg-reset", updatedAt: new Date().toISOString(),
        });
        continue;
      }
    }
    const start = checkpoint ? BigInt(checkpoint.blockNumber + 1) : from;
    if (confirmed < start) continue;
    const logs = await client.getLogs({ address, fromBlock: start, toBlock: confirmed });
    for (const log of logs) {
      const parsed: any = parseEventLogs({ abi: artifact.abi, logs: [log], strict: true })[0];
      if (!parsed) continue;
      const eventId = `${chain.id}:${address}:${log.blockHash}:${log.logIndex}`;
      let submission;
      if (parsed.eventName === "ChallengeCreated" && parsed.args.challengeId?.toLowerCase() === challenge.onchainChallengeId?.toLowerCase()) {
        const termsMatch = parsed.args.requester.toLowerCase() === challenge.requester.toLowerCase()
          && parsed.args.reward === BigInt(challenge.rewardWei)
          && parsed.args.passingScore === BigInt(challenge.passingScoreScaled)
          && parsed.args.deadline === BigInt(Math.floor(new Date(challenge.deadline).getTime() / 1000))
          && parsed.args.maxSubmissions === challenge.maxSubmissions
          && parsed.args.authorizedBackend.toLowerCase() === challenge.authorizedBackend.toLowerCase()
          && parsed.args.graderCommitment.toLowerCase() === challenge.graderCommitment?.toLowerCase()
          && parsed.args.graderVersion === challenge.graderVersion;
        if (!termsMatch) throw new Error(`indexed escrow terms mismatch for ${challenge.id}`);
        challenge.indexed = true; challenge.status = "live";
      } else if (parsed.eventName === "SubmissionFinalized") {
        submission = [...store.submissions.values()].find(value =>
          keccak256(stringToHex(value.id)).toLowerCase() === parsed.args.submissionId.toLowerCase()
          && value.submissionHash.toLowerCase() === parsed.args.submissionHash.toLowerCase()
          && value.challengeId === challenge.id
        );
        if (submission) {
          submission.status = parsed.args.paid ? "PAID" : "FINALIZED";
          submission.scoreScaled = String(parsed.args.score);
          submission.finalizedEventId = eventId;
        }
        challenge.submissions = Number(await client.readContract({ address, abi: artifact.abi, functionName: "submissions" }));
        challenge.paid = challenge.paid || Boolean(parsed.args.paid);
        if (parsed.args.paid) challenge.status = "settled";
      } else if (parsed.eventName === "ChallengeRefunded") {
        challenge.refunded = true; challenge.status = "refunded";
        challenge.refundedTransactionHash = log.transactionHash;
      } else continue;
      await store.applyIndexerEvent({
        eventId, chainId: chain.id, contractAddress: address, blockNumber: Number(log.blockNumber),
        value: { eventName: parsed.eventName, args: parsed.args, transactionHash: log.transactionHash },
      }, { challenge, submission });
    }
    if (!challenge.paid && !challenge.refunded && challenge.indexed && Date.now() > new Date(challenge.deadline).getTime()) {
      challenge.status = "expired"; await store.saveChallenge(challenge);
    }
    const block = await client.getBlock({ blockNumber: confirmed });
    await store.put(key, {
      chainId: chain.id, contractAddress: address, blockNumber: Number(confirmed),
      blockHash: block.hash, updatedAt: new Date().toISOString(),
    });
  }
}

async function run() {
  try {
    if (await client.getChainId() !== 10143) throw new Error("RPC chain id mismatch");
    await tick();
  } catch (error) {
    console.error("indexer unavailable", error instanceof Error ? error.message : error);
  }
  setTimeout(run, Number(process.env.INDEXER_INTERVAL_MS!));
}
void run();
