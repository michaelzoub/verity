import { createHash, createHmac } from "node:crypto";
import { graderInputSchema } from "@verity/api-contract";
import type { GradingJob, TrustedFunctionCall } from "@verity/domain";
import { SupabaseStore } from "@verity/adapters";
import { runGrader, validateE2BTemplates } from "./sandbox";
import { validateTrustedExecution } from "./execution-validation";

const required = [
  "API_URL", "WORKER_SHARED_SECRET", "DATABASE_URL", "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_GRADERS_BUCKET", "SUPABASE_SUBMISSIONS_BUCKET",
  "SUPABASE_ARTIFACTS_BUCKET", "E2B_API_KEY", "E2B_TEMPLATE_TS", "E2B_TEMPLATE_JS",
  "E2B_TEMPLATE_PYTHON", "GRADER_TIMEOUT_MS", "GRADER_MAX_OUTPUT_BYTES", "GRADER_MEMORY_MB",
];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
const apiUrl = process.env.API_URL!, secret = process.env.WORKER_SHARED_SECRET!, store = new SupabaseStore();
const headers = (raw: string) => ({
  "content-type": "application/json",
  "x-verity-worker-signature": createHmac("sha256", secret).update(raw).digest("hex"),
});
async function call(path: string, payload: unknown) {
  const raw = JSON.stringify(payload);
  return fetch(`${apiUrl}${path}`, { method: "POST", headers: headers(raw), body: raw });
}

function normalizeResult(value: Awaited<ReturnType<typeof runGrader>>) {
  return value.ok
    ? { outcome: "SCORED" as const, score: value.result.score, graderResult: value.result, sandboxId: value.sandboxId }
    : { outcome: !value.sandboxId ? "UNEVALUABLE" as const : value.errorCode === "GRADER_TIMEOUT" ? "GRADING_TIMEOUT" as const : "GRADER_ERROR" as const, errorCode: value.errorCode, sandboxId: value.sandboxId };
}
async function unevaluable(job: GradingJob) {
  return call("/internal/worker-results", {
    jobId: job.id, challengeId: job.challengeId, submissionId: job.submissionId,
    submissionHash: job.submissionHash, agentWallet: job.agentWallet,
    graderCommitment: job.graderCommitment, graderVersion: job.graderVersion,
    attempt: job.attempts, outcome: "UNEVALUABLE", errorCode: "SUBMISSION_INVALID",
  });
}
async function loop() {
  try {
    const claim = await call("/internal/jobs/claim", {});
    if (claim.status === 204) return setTimeout(loop, 250);
    if (!claim.ok) throw new Error(`claim ${claim.status}`);
    const { job } = await claim.json() as { job: GradingJob };
    if (!job.grader || !job.solutionObjectKey || !job.scoreSchema) throw new Error("incomplete_worker_job");
    const source = Buffer.from(await store.getObject(job.grader.objectKey)).toString("utf8");
    const rawSubmission = Buffer.from(await store.getObject(job.solutionObjectKey)).toString("utf8");
    const envelope = JSON.parse(rawSubmission) as {
      payload: { code: string; language: "typescript" | "javascript" | "python"; finalOutput: unknown; artifacts?: any[] };
      trustedFunctionCallTrace: TrustedFunctionCall[];
      traceTrust: "none" | "platform-hmac";
      platformExecutionId?: string;
    };
    const trace = envelope.traceTrust === "platform-hmac" && envelope.platformExecutionId
      ? envelope.trustedFunctionCallTrace : [];
    if ((job.requiredFunctions?.length && envelope.traceTrust !== "platform-hmac")
      || validateTrustedExecution(envelope.payload.finalOutput, trace, job.requiredFunctions ?? [], job.submissionSchema ?? {})) {
      await unevaluable(job); return setTimeout(loop, 250);
    }
    const input = graderInputSchema.parse({
      submittedCode: { source: envelope.payload.code, language: envelope.payload.language },
      agentFinalOutput: envelope.payload.finalOutput,
      trustedFunctionCallTrace: trace,
      producedArtifacts: (envelope.payload.artifacts ?? []).map((artifact: any) => {
        const serialized = JSON.stringify(artifact.content ?? null);
        return { ...artifact, sha256: createHash("sha256").update(serialized).digest("hex"), bytes: Buffer.byteLength(serialized) };
      }),
      challengeRequirements: { requiredFunctions: job.requiredFunctions ?? [], submissionSchema: job.submissionSchema ?? {} },
      scoreSchema: job.scoreSchema,
      executionMetadata: {
        submissionId: job.submissionId, challengeId: job.challengeId,
        submissionHash: job.submissionHash, receivedAt: new Date().toISOString(),
        runtime: "verity-e2b-grader-worker",
      },
    });
    const result = normalizeResult(await runGrader(job.grader.language, source, input, {
      timeoutMs: Number(process.env.GRADER_TIMEOUT_MS!),
      maxOutputBytes: Number(process.env.GRADER_MAX_OUTPUT_BYTES!),
      maxMemoryMb: Number(process.env.GRADER_MEMORY_MB!),
    }));
    const callback = {
      jobId: job.id, challengeId: job.challengeId, submissionId: job.submissionId,
      submissionHash: job.submissionHash, agentWallet: job.agentWallet,
      graderCommitment: job.graderCommitment, graderVersion: job.graderVersion,
      attempt: job.attempts, outcome: result.outcome,
      score: "score" in result ? result.score : undefined,
      graderResult: "graderResult" in result ? result.graderResult : undefined,
      errorCode: "errorCode" in result ? result.errorCode : undefined,
      sandboxId: result.sandboxId,
    };
    const response = await call("/internal/worker-results", callback);
    if (!response.ok && response.status !== 409) throw new Error(`worker callback ${response.status}`);
  } catch (error) {
    console.error("worker unavailable", error);
  }
  return setTimeout(loop, 250);
}
void validateE2BTemplates().then(loop).catch(error => { console.error(error); process.exitCode = 1; });
