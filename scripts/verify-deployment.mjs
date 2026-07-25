import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createPublicClient, decodeEventLog, defineChain, http, isAddress } from "viem";

const required = ["RPC_URL", "CHAIN_ID", "CHALLENGE_FACTORY_ADDRESS", "CONTRACT_DEPLOYMENT_BLOCK"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);
if (Number(process.env.CHAIN_ID) !== 10143) throw new Error("deployment verification is restricted to Monad Testnet (10143)");
if (!isAddress(process.env.CHALLENGE_FACTORY_ADDRESS)) throw new Error("invalid CHALLENGE_FACTORY_ADDRESS");

const artifact = JSON.parse(await readFile("artifacts/contracts/ChallengeFactory.json", "utf8"));
const chain = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL] } },
});
const client = createPublicClient({ chain, transport: http(process.env.RPC_URL) });
if (await client.getChainId() !== 10143) throw new Error("RPC chain id mismatch");
const address = process.env.CHALLENGE_FACTORY_ADDRESS;
const bytecode = await client.getBytecode({ address });
if (!bytecode || bytecode === "0x") throw new Error("factory bytecode missing");
if (bytecode.toLowerCase() !== artifact.deployedBytecode.toLowerCase()) {
  throw new Error("configured factory bytecode does not match the generated production artifact; redeploy and update CHALLENGE_FACTORY_ADDRESS");
}
const blockNumber = BigInt(process.env.CONTRACT_DEPLOYMENT_BLOCK);
const block = await client.getBlock({ blockNumber });
if (!block.hash) throw new Error("deployment block is not canonical");

// Calling the generated public mapping proves the bytecode exposes the expected factory interface.
await client.readContract({
  address,
  abi: artifact.abi,
  functionName: "escrowForChallenge",
  args: [`0x${"0".repeat(64)}`],
});

const deployment = {
  network: "monad-testnet",
  chainId: 10143,
  address,
  deploymentBlock: Number(blockNumber),
  deploymentBlockHash: block.hash,
  verifiedAt: new Date().toISOString(),
  abi: "../ChallengeFactory.json",
};
await mkdir("artifacts/contracts/deployments", { recursive: true });
await writeFile(
  "artifacts/contracts/deployments/monad-testnet.json",
  `${JSON.stringify(deployment, null, 2)}\n`,
);
console.log(JSON.stringify(deployment));
