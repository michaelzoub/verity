import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { workerResultSchema } from "@verity/api-contract";
const exec = promisify(execFile);
export type SandboxLimits = { timeoutMs: number; maxOutputBytes: number };
export async function runTypeScriptGrader(source: string, submission: string, limits: SandboxLimits = { timeoutMs: 5000, maxOutputBytes: 4096 }) {
  const dir = await mkdtemp(`${tmpdir()}/verity-grader-`); const file = `${dir}/grader.mjs`; const input = `${dir}/submission.json`;
  try { const translated = source.replace(/export\s+default\s+/, "const grader = "); await writeFile(file, `import { readFileSync } from 'node:fs';\n${translated}\nprocess.stdout.write(JSON.stringify({outcome:'SCORED',scoreBasisPoints:Number(grader(JSON.parse(readFileSync(process.argv[1],'utf8'))))}));`); await writeFile(input, submission); const result = await exec(process.execPath, [file, input], { timeout: limits.timeoutMs, maxBuffer: limits.maxOutputBytes, cwd: dir, env: { PATH: "" } }); return JSON.parse(result.stdout); }
  catch (error: any) { return { outcome: error?.killed ? "GRADING_TIMEOUT" : "GRADER_ERROR" }; } finally { await rm(dir, { recursive: true, force: true }); }
}
export function authenticateWorkerResult(result: unknown, secret: string) { const parsed = workerResultSchema.parse(result); const expected = createHash("sha256").update(`${parsed.jobId}:${parsed.submissionHash}:${parsed.outcome}:${secret}`).digest("hex"); if (parsed.signature !== expected) throw new Error("invalid worker authentication"); return parsed; }
