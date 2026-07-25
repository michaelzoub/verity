import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { workerResultSchema } from "@verity/api-contract";
const exec = promisify(execFile);
export type SandboxLimits = { timeoutMs: number; maxOutputBytes: number };
/** Language-specific adapters execute only in the restricted worker boundary. */
export async function runGrader(language: "typescript" | "javascript" | "python", entrypoint: string, source: string, submission: string, limits: SandboxLimits = { timeoutMs: 5000, maxOutputBytes: 4096 }) {
  const dir = await mkdtemp(`${tmpdir()}/verity-grader-`); const input = `${dir}/submission.json`;
  try {
    await writeFile(input, submission);
    if (language === "python") {
      const file = `${dir}/grader.py`;
      await writeFile(file, `${source}\nimport json, sys\nprint(json.dumps({'outcome':'SCORED','score': ${entrypoint}(json.load(open(sys.argv[1]))) }))\n`);
      return JSON.parse((await exec(process.env.PYTHON_BIN ?? "python3", [file, input], { timeout: limits.timeoutMs, maxBuffer: limits.maxOutputBytes, cwd: dir, env: { PATH: "" } })).stdout);
    }
    const file = `${dir}/grader.mjs`;
    const translated = language === "typescript" ? source.replace(/\bexport\s+default\s+/, "const grader = ").replace(/:\s*(number|string|boolean|unknown|any)(?=[,)=;])/g, "") : source.replace(/\bexport\s+default\s+/, "const grader = ");
    const fn = entrypoint === "default" ? "grader" : entrypoint;
    await writeFile(file, `import { readFileSync } from 'node:fs';\n${translated}\nprocess.stdout.write(JSON.stringify({outcome:'SCORED',score:${fn}(JSON.parse(readFileSync(process.argv[1],'utf8')))}));`);
    return JSON.parse((await exec(process.execPath, [file, input], { timeout: limits.timeoutMs, maxBuffer: limits.maxOutputBytes, cwd: dir, env: { PATH: "" } })).stdout);
  } catch (error: any) { return { outcome: error?.killed ? "GRADING_TIMEOUT" : "GRADER_ERROR" }; } finally { await rm(dir, { recursive: true, force: true }); }
}
export function authenticateWorkerResult(result: unknown, secret: string) { const parsed = workerResultSchema.parse(result); const expected = createHash("sha256").update(`${parsed.jobId}:${parsed.submissionHash}:${parsed.outcome}:${secret}`).digest("hex"); if (parsed.signature !== expected) throw new Error("invalid worker authentication"); return parsed; }
