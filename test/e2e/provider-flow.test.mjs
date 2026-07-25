import test from "node:test";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const enabled = process.env.VERITY_RUN_PROVIDER_E2E === "true";
const apiUrl = process.env.API_URL;
const webUrl = process.env.WEB_URL;
const companyToken = process.env.E2E_PRIVY_ACCESS_TOKEN;
const companyKey = process.env.E2E_COMPANY_PRIVATE_KEY;
const solverKey = process.env.E2E_SOLVER_PRIVATE_KEY;
const rpcUrl = process.env.RPC_URL;
const companyHeaders = (idempotencyKey) => ({
  authorization: `Bearer ${companyToken}`,
  "content-type": "application/json",
  ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
});

async function json(path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function waitFor(path, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await json(path);
    if (latest.response.ok && predicate(latest.body)) return latest.body;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  throw new Error(`timed out waiting for ${path}: ${JSON.stringify(latest?.body)}`);
}

test("real provider golden path and production failure boundaries", { timeout: 600_000 }, async t => {
  if (!enabled) {
    t.skip("set VERITY_RUN_PROVIDER_E2E=true with real provider, Privy token, and funded test-wallet credentials");
    return;
  }
  const required = [
    "WEB_URL", "API_URL", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "PRIVY_APP_ID", "PRIVY_APP_SECRET", "E2B_API_KEY", "RPC_URL", "CHAIN_ID",
    "CHALLENGE_FACTORY_ADDRESS", "SETTLEMENT_PRIVATE_KEY", "E2E_PRIVY_ACCESS_TOKEN",
    "E2E_COMPANY_PRIVATE_KEY", "E2E_SOLVER_PRIVATE_KEY",
  ];
  assert.deepEqual(required.filter(key => !process.env[key]), []);
  assert.equal(Number(process.env.CHAIN_ID), 10143);

  const chain = defineChain({
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const company = privateKeyToAccount(companyKey);
  const solver = privateKeyToAccount(solverKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const companyWallet = createWalletClient({ account: company, chain, transport: http(rpcUrl) });

  const health = await json("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.mode, "real");
  assert.equal((await json("/v1/auth/me", { headers: companyHeaders() })).response.status, 200, "Privy company sign-in");

  const suffix = Date.now().toString(36);
  const entrypoint = "solution.ts";
  const sourceFiles = [{ path: entrypoint, content: "export function solve(input) { return input; }" }];
  const scoring = { passingScore: "1", minScore: "0", maxScore: "1", scoreScale: 1, scoreUnit: "points" };
  const graderSource = `export default async function grade(input) {
    const mode = input.agentFinalOutput.mode;
    if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 60000));
    if (mode === "error") throw new Error("private grader failure");
    const score = mode === "out-of-range" ? "2" : mode === "pass" ? "1" : "0";
    return { score, passed: score === "1", feedback: "private feedback must be redacted", metadata: { hidden: true } };
  }`;
  const createBody = {
    title: `Provider E2E ${suffix}`,
    description: "Return the supplied value without modifying its public shape.",
    tags: ["e2e"],
    agentContext: "Use the complete public specification.",
    rewardWei: process.env.E2E_REWARD_WEI ?? "1",
    fundingWallet: company.address,
    maxSubmissions: 10,
    deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    chainId: 10143,
    language: "typescript",
    runtimeVersion: "22",
    entrypoint: "default",
    graderSource,
    graderConfig: {},
    dependencies: [],
    requiredFunctions: [],
    submissionSchema: { type: "object" },
    validationSample: { sourceFiles, language: "typescript", finalOutput: { mode: "pass" }, artifacts: [] },
    scoring,
    publicSpec: {
      problemDescription: "Return the supplied value without modifying its public shape.",
      successCriteria: "solve({value}) returns the same value.",
      language: "typescript",
      runtimeVersion: "22",
      entrypoint,
      requiredFunctions: [{
        name: "solve",
        inputSchema: { type: "object", required: ["value"], properties: { value: { type: "number" } } },
        outputSchema: { type: "object", required: ["value"], properties: { value: { type: "number" } } },
      }],
      submissionFormat: "A source-file bundle containing solution.ts.",
      allowedDependencies: [],
      scoring,
      examples: [{ functionName: "solve", input: { value: 7 }, output: { value: 7 } }],
      starterCode: sourceFiles[0].content,
      documentationConfirmed: true,
    },
  };

  const expired = await json("/api/challenges", {
    method: "POST",
    headers: companyHeaders(`provider-expired-${suffix}`),
    body: JSON.stringify({ ...createBody, deadline: new Date(Date.now() - 1000).toISOString() }),
  });
  assert.equal(expired.response.status, 400, "expired challenge creation rejected");

  const created = await json("/api/challenges", {
    method: "POST",
    headers: companyHeaders(`provider-create-${suffix}`),
    body: JSON.stringify(createBody),
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const challengeId = created.body.challenge.id;

  assert.equal((await json(`/api/challenges/${challengeId}`)).response.status, 404, "unindexed challenge is not discoverable");
  assert.equal((await json(`/api/challenges/${challengeId}/wallet-nonces`, { method: "POST", body: "{}" })).response.status, 409, "unfunded challenge rejects submissions");

  const tx = created.body.walletTransaction;
  const transactionHash = await companyWallet.sendTransaction({
    account: company,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value),
  });
  assert.equal((await publicClient.waitForTransactionReceipt({ hash: transactionHash })).status, "success");
  const funding = await json(`/api/challenges/${challengeId}/funding-confirmed`, {
    method: "POST",
    headers: companyHeaders(),
    body: JSON.stringify({ transactionHash }),
  });
  assert.equal(funding.response.status, 202, JSON.stringify(funding.body));
  const discovered = await waitFor(`/api/challenges/${challengeId}`, body => body.status === "live");
  assert.equal(discovered.publicSpec.entrypoint, entrypoint);
  assert.equal((await fetch(`${webUrl}/challenges/${challengeId}`)).status, 200, "local frontend renders indexed public spec");

  const missingWallet = await json(`/api/challenges/${challengeId}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { sourceFiles, language: "typescript", finalOutput: { mode: "fail" }, artifacts: [] } }),
  });
  assert.equal(missingWallet.response.status, 400);
  const invalidWallet = await json(`/api/challenges/${challengeId}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payload: { sourceFiles, language: "typescript", finalOutput: { mode: "fail" }, artifacts: [] },
      nonce: "00000000-0000-4000-8000-000000000000",
      signature: "0x00",
    }),
  });
  assert.equal(invalidWallet.response.status, 400);

  async function signedSubmission(finalOutput, nonceOverride) {
    const nonceResult = nonceOverride ?? await json(`/api/challenges/${challengeId}/wallet-nonces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(nonceResult.response.status, 201);
    const signature = await solver.signMessage({ message: nonceResult.body.message });
    const payload = { sourceFiles, language: "typescript", finalOutput, artifacts: [] };
    const result = await json(`/api/challenges/${challengeId}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, nonce: nonceResult.body.nonce, signature }),
    });
    return { ...result, nonceResult, payload, signature };
  }

  const failing = await signedSubmission({ mode: "fail" });
  assert.equal(failing.response.status, 202, JSON.stringify(failing.body));
  const replay = await json(`/api/challenges/${challengeId}/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { ...failing.payload, finalOutput: { mode: "different" } }, nonce: failing.nonceResult.body.nonce, signature: failing.signature }),
  });
  assert.equal(replay.response.status, 400, "wallet nonce replay rejected");
  const failedProjection = await waitFor(`/api/submissions/${failing.body.submission.id}`, body => ["FINALIZED", "NO_PAYOUT"].includes(body.submission.status));
  assert.equal(failedProjection.submission.score, "0");
  assert.equal("graderResult" in failedProjection.submission, false, "private grader result redacted");
  assert.equal("gradingSandboxId" in failedProjection.submission, false, "sandbox ID redacted");
  assert.equal("failureReason" in failedProjection.submission, false, "private failure details redacted");

  const duplicate = await signedSubmission({ mode: "fail" });
  assert.equal(duplicate.response.status, 400);
  assert.equal(duplicate.body.error, "duplicate_submission");

  const timeout = await signedSubmission({ mode: "timeout" });
  assert.equal(timeout.response.status, 202);
  await waitFor(`/api/submissions/${timeout.body.submission.id}`, body => body.submission.status === "TIMEOUT");

  const graderError = await signedSubmission({ mode: "error" });
  assert.equal(graderError.response.status, 202);
  await waitFor(`/api/submissions/${graderError.body.submission.id}`, body => body.submission.status === "GRADER_ERROR");

  const invalidScore = await signedSubmission({ mode: "out-of-range" });
  assert.equal(invalidScore.response.status, 202);
  await waitFor(`/api/submissions/${invalidScore.body.submission.id}`, body => body.submission.status === "GRADER_ERROR");

  const passing = await signedSubmission({ mode: "pass" });
  assert.equal(passing.response.status, 202);
  const paid = await waitFor(`/api/submissions/${passing.body.submission.id}`, body => body.submission.status === "PAID");
  assert.equal(paid.submission.payoutAddress.toLowerCase(), solver.address.toLowerCase());
  assert.match(paid.submission.transactionHash, /^0x[0-9a-f]{64}$/i);
  assert.equal((await fetch(`${webUrl}/submissions/${passing.body.submission.id}`)).status, 200, "local frontend renders real result projection");
});
