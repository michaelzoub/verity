import { createHmac } from "node:crypto";
import { runTypeScriptGrader } from "./sandbox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Worker boundary: it only claims jobs and returns a signed callback; it has no wallet/RPC access. */
export function normalizeScore(raw: number) { return Math.max(0, Math.min(10000, Math.round(raw))); }
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000"; const secret = process.env.WORKER_SHARED_SECRET ?? ""; const objectDir = process.env.VERITY_OBJECT_DIR ?? ".verity/objects";
const headers = (raw: string) => ({ "content-type": "application/json", "x-verity-worker-signature": createHmac("sha256", secret).update(raw).digest("hex") });
async function call(path: string, payload: unknown) { const raw = JSON.stringify(payload); return fetch(`${apiUrl}${path}`, { method: "POST", headers: headers(raw), body: raw }); }
async function loop() { try { const claim = await call("/internal/jobs/claim", {}); if (claim.status === 204) return setTimeout(loop, 250); if (!claim.ok) throw new Error(`claim ${claim.status}`); const { job } = await claim.json() as any; const graderSource = await readFile(join(objectDir, job.graderSourceKey.replace("/", "-")), "utf8"); const solution = await readFile(join(objectDir, job.solutionObjectKey.replace("/", "-")), "utf8"); const result = await runTypeScriptGrader(graderSource, solution, { timeoutMs: Number(process.env.GRADER_TIMEOUT_MS ?? 5000), maxOutputBytes: Number(process.env.GRADER_MAX_OUTPUT_BYTES ?? 4096) }); const callback = { jobId: job.id, challengeId: job.challengeId, submissionId: job.submissionId, submissionHash: job.submissionHash, agentWallet: job.agentWallet, graderCommitment: job.graderCommitment, graderVersion: job.graderVersion, attempt: job.attempts, outcome: result.outcome, scoreBasisPoints: result.scoreBasisPoints, signature: "worker-channel-hmac" }; await call("/internal/worker-results", callback); } catch (e) { console.error("worker unavailable", e); } return setTimeout(loop, 250); }
void loop();
