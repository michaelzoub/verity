import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
  createChallengeSchema, graderPreflightSchema, platformSubmissionSchema,
  publicTestSubmissionSchema, submitSolutionSchema, workerResultSchema,
} from "@verity/api-contract";
import { commitment, parseScaledScore, sha256Hex } from "@verity/domain";
import type { ChallengeRecord, GradingJob, Submission, PrivateGrader, TrustedFunctionCall } from "@verity/domain";
import { SupabaseStore } from "@verity/adapters";
import {
  createPublicClient, createWalletClient, decodeEventLog, defineChain, encodeFunctionData,
  formatEther, getAddress, http, keccak256, parseEventLogs, recoverMessageAddress, stringToHex, zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { authenticateCompany, AuthError, requireCompanyOwnership } from "./auth";
import { hasSupportedGraderEntrypoint } from "./grader-validation";
import { runGrader, runSubmissionHarness, validateE2BTemplates } from "../../grader-worker/src/sandbox";

const required = [
  "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_GRADERS_BUCKET",
  "SUPABASE_SUBMISSIONS_BUCKET", "SUPABASE_ARTIFACTS_BUCKET", "PRIVY_APP_ID",
  "PRIVY_APP_SECRET", "E2B_API_KEY", "E2B_TEMPLATE_TS", "E2B_TEMPLATE_JS",
  "E2B_TEMPLATE_PYTHON", "RPC_URL", "CHAIN_ID", "CHALLENGE_FACTORY_ADDRESS",
  "SETTLEMENT_PRIVATE_KEY", "WORKER_SHARED_SECRET",
  "PLATFORM_RUNTIME_SHARED_SECRET", "WEB_URL",
];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (Number(process.env.CHAIN_ID) !== 10143) throw new Error("Verity provider mode requires Monad Testnet chain id 10143");

const artifactRoot = resolve(process.cwd(), "../../artifacts/contracts");
const escrowArtifact = JSON.parse(readFileSync(join(artifactRoot, "ChallengeEscrow.json"), "utf8"));
const factoryArtifact = JSON.parse(readFileSync(join(artifactRoot, "ChallengeFactory.json"), "utf8"));
const port = Number(process.env.API_PORT ?? 4000);
const store = new SupabaseStore();
const rpcUrl = process.env.RPC_URL!;
const backend = privateKeyToAccount(process.env.SETTLEMENT_PRIVATE_KEY as `0x${string}`);
const factoryAddress = getAddress(process.env.CHALLENGE_FACTORY_ADDRESS!);
const chain = defineChain({
  id: 10143, name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: backend, chain, transport: http(rpcUrl) });
const workerSecret = process.env.WORKER_SHARED_SECRET!;
const platformSecret = process.env.PLATFORM_RUNTIME_SHARED_SECRET!;

const publicChallenge = (challenge: ChallengeRecord) => {
  const {
    companyId: _companyId, creationKey: _creationKey, creationRequestHash: _creationRequestHash,
    intendedFundingWallet: _intendedFundingWallet,
    authorizedBackend: _authorizedBackend, grader: _grader,
    graderVersion: _graderVersion, rewardWei: _rewardWei, passingScoreScaled: _passingScoreScaled,
    minScoreScaled: _minScoreScaled, maxScoreScaled: _maxScoreScaled,
    deploymentBlock: _deploymentBlock, fundingBlockNumber: _fundingBlockNumber,
    fundedAmountWei: _fundedAmountWei, indexed: _indexed, paid: _paid, refunded: _refunded,
    onchainChallengeId: _onchainChallengeId, preflightedAt: _preflightedAt,
    requiredFunctions, submissionSchema, ...safe
  } = challenge;
  return { ...safe, requiredFunctions, submissionSchema };
};
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const starterBundle = (spec: ChallengeRecord["publicSpec"]) => ({
  "manifest.json": JSON.stringify({ problemDescription: spec.problemDescription, successCriteria: spec.successCriteria, language: spec.language, runtimeVersion: spec.runtimeVersion, entrypoint: spec.entrypoint, requiredFunctions: spec.requiredFunctions, submissionFormat: spec.submissionFormat, allowedDependencies: spec.allowedDependencies, scoring: spec.scoring }, null, 2),
  "example.json": JSON.stringify(spec.examples, null, 2),
  [spec.entrypoint]: spec.starterCode ?? "",
});
async function publicTest(challenge: ChallengeRecord, body: unknown) {
  const submission = publicTestSubmissionSchema.parse(body);
  if (submission.language !== challenge.publicSpec.language) throw new Error("public_spec_language_mismatch");
  const results = [] as { functionName: string; passed: boolean }[];
  for (const example of challenge.publicSpec.examples) {
    const result = await runSubmissionHarness(submission.language, submission.code, challenge.publicSpec.entrypoint, example.functionName, example.input, {
      timeoutMs: Number(process.env.GRADER_PREFLIGHT_TIMEOUT_MS ?? 3000), maxOutputBytes: 16_384, maxMemoryMb: 128,
    });
    results.push({ functionName: example.functionName, passed: result.ok && sameJson(result.output, example.output) });
  }
  return { passed: results.every(result => result.passed), results };
}
const publicSubmission = (submission: Submission) => {
  const {
    objectKey: _objectKey, settlementSignature: _signature, settlementNonce: _nonce,
    settlementExpiry: _expiry, settlementBroadcastAt: _broadcastAt, graderResult: _graderResult,
    gradingSandboxId: _sandboxId, failureReason: _failureReason, jobId: _jobId,
    graderCommitment: _graderCommitment, graderVersion: _graderVersion,
    submittedEventId: _submittedEventId, finalizedEventId: _finalizedEventId,
    payoutEventId: _payoutEventId, traceTrust: _traceTrust,
    platformExecutionId: _platformExecutionId, ...safe
  } = submission;
  return safe;
};
const cors = (res: ServerResponse) => {
  res.setHeader("access-control-allow-origin", process.env.WEB_URL!);
  res.setHeader("access-control-allow-headers", "authorization,content-type,idempotency-key,x-verity-worker-signature,x-verity-platform-signature");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("vary", "origin");
};
const send = (res: ServerResponse, status: number, body: unknown) => {
  cors(res); res.writeHead(status, { "content-type": "application/json" });
  res.end(status === 204 ? undefined : JSON.stringify(body));
};
const safeClientErrors = new Set([
  "request_too_large", "invalid_grader_source_encoding", "invalid_grader_source",
  "grader_extension_language_mismatch", "GRADER_MISSING_ENTRYPOINT",
  "GRADER_SCORE_OUT_OF_RANGE", "invalid_score_range", "deadline_must_be_in_future",
  "public_solution_required", "starter_solution_failed_public_examples",
  "required_function_validation_requires_platform_execution",
  "invalid_or_replayed_wallet_nonce", "challenge_capacity_reached", "duplicate_submission",
  "challenge_expired", "challenge_not_live", "submission_language_mismatch",
  "submission_entrypoint_missing", "invalid_payout_wallet",
]);
function clientError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return { status: 400, code: "invalid_request" };
  }
  return safeClientErrors.has(message) ? { status: 400, code: message } : { status: 500, code: "internal_error" };
}
async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 2 * 1024 * 1024) throw new Error("request_too_large");
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return { raw, value: JSON.parse(raw || "{}") };
}
const walletMessage = (id: string, nonce: string, expiry: string) =>
  `Verity payout wallet verification\nchallenge:${id}\nnonce:${nonce}\nexpires:${expiry}`;
const validHmac = (req: IncomingMessage, raw: string, header: string, secret: string) => {
  const got = req.headers[header]; const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return typeof got === "string" && got.length === expected.length
    && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
};
function decodeUploadedSource(encoded: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("invalid_grader_source_encoding");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new Error("invalid_grader_source_encoding");
  return bytes;
}
function validateGrader(input: ReturnType<typeof createChallengeSchema.parse>, objectKey: string) {
  const bytes = input.graderSource === undefined ? decodeUploadedSource(input.graderSourceBase64!) : Buffer.from(input.graderSource, "utf8");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("invalid_grader_source_encoding"); }
  const extensions: Record<"typescript" | "javascript" | "python", string> = { typescript: ".ts", javascript: ".js", python: ".py" };
  const entrypoint = input.language === "python" ? "grade" as const : "default" as const;
  if (!source.trim() || source.includes("\0") || bytes.length > 256 * 1024) throw new Error("invalid_grader_source");
  if (input.graderFileName && extname(input.graderFileName).toLowerCase() !== extensions[input.language as keyof typeof extensions]) throw new Error("grader_extension_language_mismatch");
  if (!hasSupportedGraderEntrypoint(input.language, source)) throw new Error("GRADER_MISSING_ENTRYPOINT");
  const checksum = `0x${sha256Hex(bytes)}`;
  return {
    source,
    grader: {
      language: input.language, runtimeVersion: input.runtimeVersion, entrypoint,
      sourceBase64: bytes.toString("base64"), sourceBytes: bytes.length, objectKey,
      config: input.graderConfig, dependencies: input.dependencies, checksum, version: 1,
      commitment: commitment(source, input.language, input.runtimeVersion, entrypoint, {
        config: input.graderConfig, dependencies: input.dependencies,
      }),
    } satisfies PrivateGrader,
  };
}
function scoreTerms(scoring: { passingScore: string; minScore?: string; maxScore?: string; scoreScale: number }) {
  const pass = parseScaledScore(scoring.passingScore, scoring.scoreScale);
  const min = scoring.minScore === undefined ? undefined : parseScaledScore(scoring.minScore, scoring.scoreScale);
  const max = scoring.maxScore === undefined ? undefined : parseScaledScore(scoring.maxScore, scoring.scoreScale);
  if ((min !== undefined && max !== undefined && min > max) || (min !== undefined && pass < min) || (max !== undefined && pass > max)) throw new Error("invalid_score_range");
  return { pass, min, max };
}
async function preflight(input: ReturnType<typeof graderPreflightSchema.parse>) {
  const normalized: any = { ...input, entrypoint: input.language === "python" ? "grade" : "default" };
  const { source } = validateGrader(normalized, "preflight/private");
  const extension = input.language === "typescript" ? "ts" : input.language === "javascript" ? "js" : "py";
  const sample = input.validationSample ?? { sourceFiles: [{ path: `solution.${extension}`, content: "// preflight sample" }], language: input.language, finalOutput: {}, artifacts: [] };
  const sampleEntrypoint = sample.sourceFiles[0];
  const result = await runGrader(input.language, source, {
    submittedCode: { source: sampleEntrypoint.content, files: sample.sourceFiles, language: sample.language },
    agentFinalOutput: sample.finalOutput, trustedFunctionCallTrace: [],
    producedArtifacts: sample.artifacts.map((artifact: any) => ({
      ...artifact, sha256: sha256Hex(Buffer.from(JSON.stringify(artifact.content ?? null))),
      bytes: Buffer.byteLength(JSON.stringify(artifact.content ?? null)),
    })),
    challengeRequirements: { requiredFunctions: input.requiredFunctions, submissionSchema: input.submissionSchema },
    scoreSchema: input.scoring,
    executionMetadata: {
      submissionId: "preflight", challengeId: "preflight", submissionHash: `0x${"0".repeat(64)}`,
      receivedAt: new Date().toISOString(), runtime: "verity-preflight",
    },
  }, { timeoutMs: Number(process.env.GRADER_PREFLIGHT_TIMEOUT_MS ?? 3000), maxOutputBytes: 16384, maxMemoryMb: 128 });
  if (!result.ok) throw new Error(result.errorCode);
  const terms = scoreTerms(input.scoring); const score = parseScaledScore(result.result.score, input.scoring.scoreScale);
  if ((terms.min !== undefined && score < terms.min) || (terms.max !== undefined && score > terms.max)) throw new Error("GRADER_SCORE_OUT_OF_RANGE");
  return result;
}
async function settle(submission: Submission, challenge: ChallengeRecord) {
  if (!challenge.contractAddress || !challenge.onchainChallengeId || submission.scoreScaled === undefined) throw new Error("settlement_not_ready");
  const submissionId = keccak256(stringToHex(submission.id));
  if (await publicClient.readContract({ address: challenge.contractAddress as `0x${string}`, abi: escrowArtifact.abi, functionName: "finalized", args: [submissionId] })) return;
  const expiry = BigInt(Math.min(Math.floor(Date.now() / 1000) + 300, Math.floor(new Date(challenge.deadline).getTime() / 1000)));
  if (expiry <= BigInt(Math.floor(Date.now() / 1000))) throw new Error("challenge_expired");
  const nonce = BigInt(`0x${sha256Hex(submission.id).slice(0, 16)}`);
  const score = BigInt(submission.scoreScaled); const outcome = keccak256(stringToHex("SCORED"));
  const message = {
    chainId: 10143n, verifyingContract: challenge.contractAddress as `0x${string}`,
    challengeId: challenge.onchainChallengeId as `0x${string}`, submissionId,
    submissionHash: submission.submissionHash as `0x${string}`,
    agent: submission.agentWallet as `0x${string}`, score, outcome,
    graderCommitment: challenge.graderCommitment as `0x${string}`,
    graderVersion: challenge.graderVersion, nonce, expiry,
  };
  const types = { Settlement: [
    { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
    { name: "challengeId", type: "bytes32" }, { name: "submissionId", type: "bytes32" },
    { name: "submissionHash", type: "bytes32" }, { name: "agent", type: "address" },
    { name: "score", type: "uint256" }, { name: "outcome", type: "bytes32" },
    { name: "graderCommitment", type: "bytes32" }, { name: "graderVersion", type: "uint32" },
    { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" },
  ] } as const;
  const signature = await backend.signTypedData({
    domain: { name: "Verity ChallengeEscrow", version: "1", chainId: 10143, verifyingContract: challenge.contractAddress as `0x${string}` },
    types, primaryType: "Settlement", message,
  });
  submission.status = "SETTLEMENT_PENDING"; submission.settlementNonce = nonce.toString();
  submission.settlementExpiry = expiry.toString(); submission.settlementSignature = signature;
  await store.saveSubmission(submission);
  const gas = await publicClient.estimateContractGas({
    account: backend, address: challenge.contractAddress as `0x${string}`, abi: escrowArtifact.abi,
    functionName: "finalize",
    args: [submissionId, submission.submissionHash, submission.agentWallet, score, outcome, nonce, expiry, signature],
  });
  submission.transactionHash = await walletClient.writeContract({
    address: challenge.contractAddress as `0x${string}`, abi: escrowArtifact.abi,
    functionName: "finalize",
    args: [submissionId, submission.submissionHash, submission.agentWallet, score, outcome, nonce, expiry, signature],
    gas: gas + gas / 20n,
  });
  submission.settlementBroadcastAt = new Date().toISOString();
  await store.saveSubmission(submission);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: submission.transactionHash as `0x${string}`, confirmations: 1 });
  if (receipt.status !== "success") throw new Error("settlement_transaction_reverted");
}
async function dispatchSettlement(submission: Submission, challenge: ChallengeRecord) {
  if (Date.now() > new Date(challenge.deadline).getTime()) {
    submission.status = "NO_PAYOUT"; submission.failureReason = "challenge_expired_before_settlement";
    await store.saveSubmission(submission); return;
  }
  const passing = BigInt(submission.scoreScaled!) >= BigInt(challenge.passingScoreScaled);
  if (passing && !await store.claimPayout(challenge.id, submission.id)) {
    submission.status = "NO_PAYOUT"; submission.failureReason = "reward_already_claimed";
    await store.saveSubmission(submission); return;
  }
  try { await store.withSettlementSignerLock(() => settle(submission, challenge)); }
  catch (error) {
    if (passing) await store.releasePayoutClaim(challenge.id, submission.id);
    submission.status = "GRADED"; await store.saveSubmission(submission);
    throw error;
  }
}
async function createSubmission(challenge: ChallengeRecord, rawInput: unknown, trace: TrustedFunctionCall[], platformExecutionId?: string) {
  const input = platformExecutionId ? platformSubmissionSchema.parse(rawInput) : submitSolutionSchema.parse(rawInput);
  if (!platformExecutionId && challenge.requiredFunctions.length) throw new Error("required_function_validation_requires_platform_execution");
  if (Date.now() >= new Date(challenge.deadline).getTime()) throw new Error("challenge_expired");
  if (input.payload.language !== challenge.publicSpec.language) throw new Error("submission_language_mismatch");
  if (!input.payload.sourceFiles.some(file => file.path === challenge.publicSpec.entrypoint)) throw new Error("submission_entrypoint_missing");
  const nonce = await store.getWalletNonce(input.nonce);
  if (!nonce || nonce.usedAt || nonce.challengeId !== challenge.id || Date.now() > new Date(nonce.expiresAt).getTime()) throw new Error("invalid_or_replayed_wallet_nonce");
  const agent = getAddress(await recoverMessageAddress({ message: walletMessage(challenge.id, nonce.nonce, nonce.expiresAt), signature: input.signature as `0x${string}` }));
  if (agent === zeroAddress) throw new Error("invalid_payout_wallet");
  const id = randomUUID();
  const envelope = { payload: input.payload, trustedFunctionCallTrace: trace, traceTrust: platformExecutionId ? "platform-hmac" : "none", platformExecutionId };
  const bytes = Buffer.from(JSON.stringify(envelope)); const submissionHash = `0x${sha256Hex(bytes)}`;
  const objectKey = `submissions/${id}.json`; await store.putObject(objectKey, bytes);
  const job: GradingJob = {
    id: randomUUID(), submissionId: id, challengeId: challenge.id, submissionHash,
    agentWallet: agent, graderCommitment: challenge.graderCommitment!, graderVersion: challenge.graderVersion,
    submissionEntrypoint: challenge.publicSpec.entrypoint,
    candidateFunctionName: challenge.publicSpec.examples[0].functionName,
    candidateInput: challenge.publicSpec.examples[0].input,
    attempts: 1, status: "queued", createdAt: new Date().toISOString(),
    requiredFunctions: challenge.requiredFunctions, submissionSchema: challenge.submissionSchema,
    scoreSchema: { passingScore: challenge.passingScore, minScore: challenge.minScore, maxScore: challenge.maxScore, scoreScale: challenge.scoreScale, scoreUnit: challenge.scoreUnit },
  };
  const submission: Submission = {
    id, challengeId: challenge.id, agentWallet: agent, payoutAddress: agent, objectKey,
    submissionHash, status: "QUEUED", createdAt: new Date().toISOString(), jobId: job.id,
    graderCommitment: challenge.graderCommitment, graderVersion: challenge.graderVersion,
    traceTrust: platformExecutionId ? "platform-hmac" : "none", platformExecutionId,
  };
  const created = await store.createSubmissionJob(input.nonce, submission, job, challenge.maxSubmissions);
  if (created !== "created") {
    if (created === "capacity") throw new Error("challenge_capacity_reached");
    if (created === "duplicate") throw new Error("duplicate_submission");
    if (created === "expired") throw new Error("challenge_expired");
    if (created === "challenge_not_live") throw new Error("challenge_not_live");
    throw new Error("invalid_or_replayed_wallet_nonce");
  }
  return submission;
}

async function main() {
  await validateE2BTemplates();
  await store.load();
  if (await publicClient.getChainId() !== 10143) throw new Error("RPC chain id mismatch");
  if (!await publicClient.getBytecode({ address: factoryAddress })) throw new Error("ChallengeFactory bytecode missing");

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return send(res, 204, {});
      await store.load();
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const parts = url.pathname.split("/").filter(Boolean);
      const parsed = req.method === "GET" ? { raw: "", value: {} } : await readBody(req);
      const { raw, value } = parsed;

      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, mode: "real", chainId: 10143, factoryAddress });
      if (req.method === "GET" && url.pathname === "/v1/auth/me") {
        const auth = await authenticateCompany(req, store);
        return send(res, 200, { company: { id: auth.company.id }, privySubject: auth.privySubject });
      }
      if (req.method === "GET" && url.pathname === "/api/challenges") {
        const challenges = await store.listChallenges(true);
        return send(res, 200, { challenges: challenges.map(publicChallenge) });
      }
      if (req.method === "GET" && parts[0] === "api" && parts[1] === "challenges" && parts[2] && parts.length === 3) {
        const challenge = (await store.listChallenges()).find(value => value.id === parts[2]);
        return challenge?.indexed ? send(res, 200, publicChallenge(challenge)) : send(res, 404, { error: "challenge_not_found" });
      }
      if (req.method === "GET" && parts[0] === "api" && parts[1] === "challenges" && parts[2] && parts[3] === "starter-bundle") {
        const challenge = await store.getChallenge(parts[2]);
        return challenge?.indexed ? send(res, 200, { files: starterBundle(challenge.publicSpec) }) : send(res, 404, { error: "challenge_not_found" });
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[2] && parts[3] === "test-submission") {
        const challenge = await store.getChallenge(parts[2]);
        if (!challenge?.indexed) return send(res, 404, { error: "challenge_not_found" });
        return send(res, 200, await publicTest(challenge, value));
      }
      if (req.method === "GET" && url.pathname === "/api/company/challenges") {
        const auth = await authenticateCompany(req, store);
        const challenges = await store.listChallenges();
        return send(res, 200, { challenges: challenges.filter(challenge => challenge.companyId === auth.company.id).map(publicChallenge) });
      }
      if (req.method === "GET" && parts[0] === "api" && parts[1] === "submissions" && parts[2]) {
        const submission = await store.getSubmission(parts[2]);
        if (submission?.status === "SETTLEMENT_PENDING" && submission.transactionHash && submission.settlementBroadcastAt
          && Date.now() - new Date(submission.settlementBroadcastAt).getTime() > 300_000) {
          const transaction = await publicClient.getTransaction({ hash: submission.transactionHash as `0x${string}` }).catch(() => undefined);
          if (!transaction) {
            await store.releasePayoutClaim(submission.challengeId, submission.id);
            submission.status = "GRADED"; submission.transactionHash = undefined;
            submission.settlementBroadcastAt = undefined; await store.saveSubmission(submission);
          }
        }
        if (submission?.status === "GRADED" && submission.outcome === "SCORED" && submission.scoreScaled !== undefined) {
          const challenge = await store.getChallenge(submission.challengeId);
          if (challenge?.indexed) await dispatchSettlement(submission, challenge);
        }
        return submission ? send(res, 200, { submission: publicSubmission(submission) }) : send(res, 404, { error: "submission_not_found" });
      }
      if (req.method === "POST" && url.pathname === "/api/graders/preflight") {
        await authenticateCompany(req, store); const input = graderPreflightSchema.parse(value);
        const validation = await preflight(input);
        return send(res, 200, { ok: true, entrypoint: input.language === "python" ? "grade" : "default", validationResult: validation.result });
      }
      if (req.method === "POST" && url.pathname === "/api/challenges") {
        const auth = await authenticateCompany(req, store); const input = createChallengeSchema.parse(value);
        const creationKey = req.headers["idempotency-key"];
        if (typeof creationKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(creationKey)) {
          return send(res, 400, { error: "invalid_idempotency_key" });
        }
        const creationRequestHash = sha256Hex(Buffer.from(raw));
        const existing = await store.findChallengeByCreationKey(auth.company.id, creationKey);
        if (existing) {
          if (existing.creationRequestHash !== creationRequestHash) {
            return send(res, 409, { error: "idempotency_key_payload_mismatch" });
          }
          const existingTerms = scoreTerms(existing.publicSpec.scoring);
          const data = encodeFunctionData({
            abi: factoryArtifact.abi, functionName: "createChallenge",
            args: [keccak256(stringToHex(existing.id)), existingTerms.pass, existing.maxSubmissions, BigInt(Math.floor(new Date(existing.deadline).getTime() / 1000)), backend.address, existing.graderCommitment, existing.graderVersion],
          });
          return send(res, 200, { challenge: publicChallenge(existing), walletTransaction: { to: factoryAddress, data, value: existing.rewardWei, chainId: 10143 }, idempotentReplay: true });
        }
        if (new Date(input.deadline).getTime() <= Date.now()) throw new Error("deadline_must_be_in_future");
        const id = randomUUID(); const graderObjectKey = `graders/${id}.${input.language === "typescript" ? "ts" : input.language === "javascript" ? "js" : "py"}`;
        const { grader } = validateGrader(input, graderObjectKey); const terms = scoreTerms(input.scoring);
        const challenge: ChallengeRecord = {
          id, companyId: auth.company.id, creationKey, creationRequestHash,
          intendedFundingWallet: getAddress(input.fundingWallet), title: input.title,
          description: input.description, tags: input.tags,
          reward: `${formatEther(BigInt(input.rewardWei))} MON`, passingScore: input.scoring.passingScore, minScore: input.scoring.minScore,
          maxScore: input.scoring.maxScore, scoreScale: input.scoring.scoreScale, scoreUnit: input.scoring.scoreUnit,
          submissions: 0, maxSubmissions: input.maxSubmissions, deadline: input.deadline, requester: "",
          status: "funding", context: input.agentContext, format: "JSON", graderType: `${input.language} private grader`,
          chainId: 10143, authorizedBackend: backend.address, grader, graderVersion: 1,
          requiredFunctions: input.requiredFunctions, submissionSchema: input.submissionSchema,
          publicSpec: input.publicSpec,
          preflightedAt: new Date().toISOString(), graderCommitment: grader.commitment, rewardWei: input.rewardWei,
          passingScoreScaled: terms.pass.toString(), minScoreScaled: terms.min?.toString(), maxScoreScaled: terms.max?.toString(),
          createdAt: new Date().toISOString(), indexed: false, paid: false, refunded: false,
        };
        const publicSolution = input.publicSpec.starterCode
          ?? input.validationSample?.sourceFiles.find((file: { path: string; content: string }) => file.path === input.publicSpec.entrypoint)?.content;
        if (!publicSolution || (input.validationSample && !input.publicSpec.starterCode && input.validationSample.language !== input.publicSpec.language)) throw new Error("public_solution_required");
        const check = await publicTest(challenge, { code: publicSolution, language: input.publicSpec.language });
        if (!check.passed) throw new Error("starter_solution_failed_public_examples");
        await store.putObject(graderObjectKey, Buffer.from(grader.sourceBase64, "base64"));
        await store.saveChallenge(challenge);
        const data = encodeFunctionData({
          abi: factoryArtifact.abi, functionName: "createChallenge",
          args: [keccak256(stringToHex(id)), terms.pass, challenge.maxSubmissions, BigInt(Math.floor(new Date(challenge.deadline).getTime() / 1000)), backend.address, challenge.graderCommitment, challenge.graderVersion],
        });
        return send(res, 201, { challenge: publicChallenge(challenge), walletTransaction: { to: factoryAddress, data, value: challenge.rewardWei, chainId: 10143 } });
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[3] === "funding-confirmed") {
        const auth = await authenticateCompany(req, store); const challenge = await store.getChallenge(parts[2]);
        if (!challenge) return send(res, 404, { error: "challenge_not_found" });
        requireCompanyOwnership(challenge.companyId, auth.company.id);
        const transactionHash = String((value as any).transactionHash) as `0x${string}`;
        const [receipt, transaction] = await Promise.all([
          publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 120_000 }),
          publicClient.getTransaction({ hash: transactionHash }),
        ]);
        if (receipt.status !== "success"
          || transaction.to?.toLowerCase() !== factoryAddress.toLowerCase()
          || transaction.from.toLowerCase() !== challenge.intendedFundingWallet.toLowerCase()
          || transaction.value !== BigInt(challenge.rewardWei)
        ) return send(res, 409, { error: "funding_not_confirmed" });
        const event = receipt.logs.filter(log => log.address.toLowerCase() === factoryAddress.toLowerCase()).map(log => {
          try { return decodeEventLog({ abi: factoryArtifact.abi, ...log }); } catch { return undefined; }
        }).find((log: any) => log?.eventName === "ChallengeDeployed" && log.args.challengeId?.toLowerCase() === keccak256(stringToHex(challenge.id)).toLowerCase()) as any;
        const expectedDeadline = BigInt(Math.floor(new Date(challenge.deadline).getTime() / 1000));
        if (!event
          || event.args.requester.toLowerCase() !== transaction.from.toLowerCase()
          || event.args.reward !== BigInt(challenge.rewardWei)
          || event.args.passingScore !== BigInt(challenge.passingScoreScaled)
          || event.args.deadline !== expectedDeadline
          || event.args.maxSubmissions !== challenge.maxSubmissions
          || event.args.authorizedBackend.toLowerCase() !== backend.address.toLowerCase()
          || event.args.graderCommitment.toLowerCase() !== challenge.graderCommitment?.toLowerCase()
          || event.args.graderVersion !== challenge.graderVersion
        ) return send(res, 400, { error: "wrong_challenge_deployment" });
        if (!await publicClient.getBytecode({ address: event.args.escrow })) return send(res, 409, { error: "escrow_bytecode_missing" });
        challenge.contractAddress = event.args.escrow; challenge.onchainChallengeId = event.args.challengeId;
        challenge.requester = transaction.from; challenge.transactionHash = transactionHash;
        challenge.fundedAmountWei = transaction.value.toString();
        challenge.fundingBlockNumber = Number(receipt.blockNumber);
        challenge.deploymentBlock = Number(receipt.blockNumber); await store.saveChallenge(challenge);
        return send(res, 202, {
          challenge: publicChallenge(challenge),
          status: "AWAITING_INDEX",
          funding: {
            chainId: challenge.chainId,
            contractAddress: challenge.contractAddress,
            transactionHash: challenge.transactionHash,
            fundedAmountWei: challenge.fundedAmountWei,
            blockNumber: challenge.fundingBlockNumber,
          },
        });
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[3] === "refund-transaction") {
        const auth = await authenticateCompany(req, store); const challenge = await store.getChallenge(parts[2]);
        if (!challenge?.contractAddress) return send(res, 404, { error: "challenge_not_found" });
        requireCompanyOwnership(challenge.companyId, auth.company.id);
        if (Date.now() <= new Date(challenge.deadline).getTime()) return send(res, 409, { error: "challenge_not_expired" });
        const [paid, refunded] = await Promise.all([
          publicClient.readContract({ address: challenge.contractAddress as `0x${string}`, abi: escrowArtifact.abi, functionName: "paid" }),
          publicClient.readContract({ address: challenge.contractAddress as `0x${string}`, abi: escrowArtifact.abi, functionName: "refunded" }),
        ]);
        if (paid || refunded) return send(res, 409, { error: "challenge_already_resolved" });
        return send(res, 200, { walletTransaction: {
          to: challenge.contractAddress,
          data: encodeFunctionData({ abi: escrowArtifact.abi, functionName: "refundExpired" }),
          value: "0", chainId: 10143,
        } });
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[3] === "wallet-nonces") {
        const challenge = await store.getChallenge(parts[2]);
        if (!challenge?.indexed || challenge.status !== "live" || Date.now() >= new Date(challenge.deadline).getTime()) return send(res, 409, { error: "challenge_not_live" });
        const nonce = randomUUID(), expiresAt = new Date(Date.now() + 300_000).toISOString();
        await store.saveWalletNonce({ nonce, purpose: "agent_submission", challengeId: challenge.id, expiresAt });
        return send(res, 201, { nonce, expiresAt, message: walletMessage(challenge.id, nonce, expiresAt), requiredCallValidation: challenge.requiredFunctions.length ? "platform_execution_only" : "not_required" });
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "challenges" && parts[3] === "submissions") {
        const challenge = await store.getChallenge(parts[2]);
        if (!challenge?.indexed || challenge.status !== "live") return send(res, 409, { error: "challenge_not_live" });
        if (validHmac(req, raw, "x-verity-platform-signature", platformSecret)) {
          const input = platformSubmissionSchema.parse(value);
          return send(res, 202, { submission: publicSubmission(await createSubmission(challenge, input, input.trustedFunctionCallTrace as TrustedFunctionCall[], input.platformExecutionId)) });
        }
        return send(res, 202, { submission: publicSubmission(await createSubmission(challenge, value, [])) });
      }
      if (req.method === "POST" && parts[0] === "internal" && parts[1] === "platform-submissions" && parts[2]) {
        if (!validHmac(req, raw, "x-verity-platform-signature", platformSecret)) return send(res, 401, { error: "platform_runtime_unauthorized" });
        const challenge = await store.getChallenge(parts[2]); if (!challenge?.indexed || challenge.status !== "live") return send(res, 409, { error: "challenge_not_live" });
        const input = platformSubmissionSchema.parse(value);
        return send(res, 202, { submission: publicSubmission(await createSubmission(challenge, input, input.trustedFunctionCallTrace as TrustedFunctionCall[], input.platformExecutionId)) });
      }
      if (req.method === "POST" && url.pathname === "/internal/jobs/claim") {
        if (!validHmac(req, raw, "x-verity-worker-signature", workerSecret)) return send(res, 401, { error: "worker_unauthorized" });
        const job = await store.dequeue(); if (!job) return send(res, 204, {});
        const submission = await store.getSubmission(job.submissionId); const challenge = submission && await store.getChallenge(submission.challengeId);
        if (!submission || !challenge) return send(res, 409, { error: "job_missing_records" });
        submission.status = "GRADING"; await store.saveSubmission(submission);
        job.claimedAt = new Date().toISOString(); const { sourceBase64: _source, ...workerGrader } = challenge.grader;
        job.grader = workerGrader; job.solutionObjectKey = submission.objectKey; await store.updateJob(job);
        return send(res, 200, { job });
      }
      if (req.method === "POST" && url.pathname === "/internal/worker-results") {
        if (!validHmac(req, raw, "x-verity-worker-signature", workerSecret)) return send(res, 401, { error: "worker_unauthorized" });
        const result = workerResultSchema.parse(value); const job = store.jobs.find(item => item.id === result.jobId);
        const submission = await store.getSubmission(result.submissionId); const challenge = await store.getChallenge(result.challengeId);
        if (!job || !submission || !challenge || job.status !== "running" || job.submissionId !== submission.id || job.attempts !== result.attempt || submission.submissionHash !== result.submissionHash || submission.agentWallet.toLowerCase() !== result.agentWallet.toLowerCase() || challenge.graderCommitment !== result.graderCommitment || challenge.graderVersion !== result.graderVersion) return send(res, 409, { error: "forged_stale_or_mismatched_worker_result" });
        if (result.outcome === "SCORED") {
          let scaled: bigint;
          try {
            scaled = parseScaledScore(result.score!, challenge.scoreScale);
            if ((challenge.minScoreScaled && scaled < BigInt(challenge.minScoreScaled)) || (challenge.maxScoreScaled && scaled > BigInt(challenge.maxScoreScaled))) throw new Error("GRADER_SCORE_OUT_OF_RANGE");
          } catch {
            submission.outcome = "GRADER_ERROR"; submission.status = "GRADER_ERROR";
            submission.failureReason = "GRADER_SCORE_OUT_OF_RANGE"; submission.gradingSandboxId = result.sandboxId;
            if (!await store.completeJob(job.id, result.attempt, submission)) return send(res, 409, { error: "worker_result_already_consumed" });
            return send(res, 202, { submission: publicSubmission(submission) });
          }
          submission.score = result.score; submission.scoreScaled = scaled.toString(); submission.graderResult = result.graderResult;
        } else submission.failureReason = result.errorCode ?? "GRADER_ERROR";
        submission.outcome = result.outcome;
        submission.gradingSandboxId = result.sandboxId;
        submission.status = result.outcome === "SCORED" ? "GRADED" : result.outcome === "UNEVALUABLE" ? "UNEVALUABLE" : result.outcome === "GRADING_TIMEOUT" ? "TIMEOUT" : "GRADER_ERROR";
        if (!await store.completeJob(job.id, result.attempt, submission)) return send(res, 409, { error: "worker_result_already_consumed" });
        if (result.outcome === "SCORED") await dispatchSettlement(submission, challenge);
        return send(res, 202, { submission: publicSubmission(submission) });
      }
      return send(res, 404, { error: "not_found" });
    } catch (error) {
      if (error instanceof AuthError) return send(res, error.status, { error: error.code });
      const safe = clientError(error);
      return send(res, safe.status, { error: safe.code });
    }
  });
  // Bind IPv4 explicitly. The worker uses 127.0.0.1 in local development;
  // Node may otherwise select an IPv6-only listener on some machines.
  server.listen(port, "0.0.0.0", () => console.log(`Verity API listening on http://0.0.0.0:${port}`));
}
void main();
