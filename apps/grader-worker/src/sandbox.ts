import { Sandbox } from "e2b";
import { graderInputSchema, graderResultSchema } from "@verity/api-contract";
import type { GraderErrorCode } from "@verity/domain";

export type SandboxLimits = { timeoutMs: number; maxOutputBytes: number; maxMemoryMb?: number };
export type SandboxResult = { ok: true; result: ReturnType<typeof graderResultSchema.parse>; sandboxId: string } | { ok: false; errorCode: GraderErrorCode; sandboxId?: string };
export type PublicHarnessResult = { ok: true; output: unknown; sandboxId: string } | { ok: false; errorCode: GraderErrorCode; sandboxId?: string };

const templateFor = (language: "typescript" | "javascript" | "python") => {
  const key = language === "typescript" ? "E2B_TEMPLATE_TS" : language === "javascript" ? "E2B_TEMPLATE_JS" : "E2B_TEMPLATE_PYTHON";
  const template = process.env[key];
  if (!template) throw new Error(`${key} is required`);
  return template;
};
export async function validateE2BTemplates() {
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
  for (const key of ["E2B_TEMPLATE_TS", "E2B_TEMPLATE_JS", "E2B_TEMPLATE_PYTHON"]) {
    const id = process.env[key];
    if (!id) throw new Error(`${key} is required`);
    const response = await fetch(
      `https://api.e2b.app/templates/${encodeURIComponent(id)}`,
      { headers: { "X-API-Key": process.env.E2B_API_KEY } },
    );
    if (!response.ok) throw new Error(`invalid E2B template ID: ${id} (${response.status})`);
  }
}

/** The only grader executor. Every preflight and grading run creates and kills a fresh E2B VM. */
export async function runGrader(language: "typescript" | "javascript" | "python", source: string, inputValue: unknown, limits: SandboxLimits = { timeoutMs: 5_000, maxOutputBytes: 16_384, maxMemoryMb: 128 }): Promise<SandboxResult> {
  const input = graderInputSchema.safeParse(inputValue);
  if (!input.success) return { ok: false, errorCode: "SUBMISSION_INVALID" };
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create(templateFor(language), {
      timeoutMs: limits.timeoutMs + 30_000,
      allowInternetAccess: false,
    });
    const root = "/home/oai/verity";
    await sandbox.files.write(`${root}/input.json`, JSON.stringify(input.data));
    if (language === "python") {
      await sandbox.files.write(`${root}/grader.py`, `${source}\nimport json\nprint(json.dumps(grade(json.load(open('${root}/input.json')))))\n`);
    } else {
      // Templates must provide tsx for TypeScript and node for JavaScript; source is never executed on the host.
      const runner = language === "typescript" ? "tsx" : "node";
      const file = language === "typescript" ? "grader.ts" : "grader.mjs";
      await sandbox.files.write(`${root}/${file}`, source);
      const runnerFile = language === "typescript" ? "run.ts" : "run.mjs";
      await sandbox.files.write(`${root}/${runnerFile}`, `import input from './input.json' with { type: 'json' };\nimport grade from './${file}';\nasync function main() { const value = await grade(input); console.log(JSON.stringify(value)); }\nvoid main();\n`);
      await sandbox.files.write(`${root}/run.sh`, `exec ${runner} ${root}/${runnerFile}`);
    }
    const command = language === "python" ? `python3 ${root}/grader.py` : `sh ${root}/run.sh`;
    const execution = await sandbox.commands.run(command, { cwd: root, timeoutMs: limits.timeoutMs });
    const stdout = String(execution.stdout ?? "");
    if (Buffer.byteLength(stdout) > limits.maxOutputBytes) return { ok: false, errorCode: "GRADER_INVALID_RESULT", sandboxId: sandbox.sandboxId };
    if (execution.exitCode !== 0) return { ok: false, errorCode: /SyntaxError|IndentationError/.test(String(execution.stderr)) ? "GRADER_COMPILE_FAILURE" : "GRADER_MISSING_ENTRYPOINT", sandboxId: sandbox.sandboxId };
    const parsed = graderResultSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? { ok: true, result: parsed.data, sandboxId: sandbox.sandboxId } : { ok: false, errorCode: "GRADER_INVALID_RESULT", sandboxId: sandbox.sandboxId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, errorCode: /timeout/i.test(message) ? "GRADER_TIMEOUT" : "GRADER_COMPILE_FAILURE", sandboxId: sandbox?.sandboxId };
  } finally { if (sandbox) await sandbox.kill().catch(() => undefined); }
}

/** Shared E2B module runner for public submission tests. It intentionally returns no stderr or sandbox internals. */
export async function runSubmissionHarness(language: "typescript" | "javascript" | "python", source: string, entrypoint: string, functionName: string, input: unknown, limits: SandboxLimits = { timeoutMs: 5_000, maxOutputBytes: 16_384, maxMemoryMb: 128 }): Promise<PublicHarnessResult> {
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create(templateFor(language), { timeoutMs: limits.timeoutMs + 30_000, allowInternetAccess: false });
    const root = "/home/oai/verity";
    await sandbox.files.write(`${root}/input.json`, JSON.stringify(input));
    let command: string;
    if (language === "python") {
      await sandbox.files.write(`${root}/submission.py`, `${source}\nimport json\nprint(json.dumps(globals()['${functionName}'](json.load(open('${root}/input.json')))))\n`);
      command = `python3 ${root}/submission.py`;
    } else {
      const file = language === "typescript" ? "submission.ts" : "submission.mjs";
      const runner = language === "typescript" ? "tsx" : "node";
      await sandbox.files.write(`${root}/${file}`, source);
      await sandbox.files.write(`${root}/run.${language === "typescript" ? "ts" : "mjs"}`, `import * as submitted from './${file}';\nimport input from './input.json' with { type: 'json' };\nasync function main() { const fn = submitted['${functionName}']; if (typeof fn !== 'function') throw new Error('missing exported function'); console.log(JSON.stringify(await fn(input))); }\nvoid main();\n`);
      command = `${runner} ${root}/run.${language === "typescript" ? "ts" : "mjs"}`;
    }
    const execution = await sandbox.commands.run(command, { cwd: root, timeoutMs: limits.timeoutMs });
    const stdout = String(execution.stdout ?? "");
    if (Buffer.byteLength(stdout) > limits.maxOutputBytes) return { ok: false, errorCode: "SUBMISSION_INVALID", sandboxId: sandbox.sandboxId };
    if (execution.exitCode !== 0) return { ok: false, errorCode: "GRADER_MISSING_ENTRYPOINT", sandboxId: sandbox.sandboxId };
    try { return { ok: true, output: JSON.parse(stdout), sandboxId: sandbox.sandboxId }; }
    catch { return { ok: false, errorCode: "SUBMISSION_INVALID", sandboxId: sandbox.sandboxId }; }
  } catch (error) {
    return { ok: false, errorCode: /timeout/i.test(error instanceof Error ? error.message : "") ? "GRADER_TIMEOUT" : "SUBMISSION_INVALID", sandboxId: sandbox?.sandboxId };
  } finally { if (sandbox) await sandbox.kill().catch(() => undefined); }
}

/** Executes the submitted bundle in its own fresh sandbox. JSON enters only through stdin. */
export async function runCandidateBundle(
  language: "typescript" | "javascript" | "python",
  files: { path: string; content: string }[],
  entrypoint: string,
  functionName: string,
  input: unknown,
  limits: SandboxLimits,
): Promise<PublicHarnessResult> {
  if (!process.env.E2B_API_KEY) throw new Error("E2B_API_KEY is required");
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await Sandbox.create(templateFor(language), {
      timeoutMs: limits.timeoutMs + 30_000,
      allowInternetAccess: false,
    });
    const root = "/home/oai/verity-candidate";
    for (const file of files) await sandbox.files.write(`${root}/${file.path}`, file.content);
    let command: string;
    if (language === "python") {
      const runner = `${root}/__verity_runner.py`;
      await sandbox.files.write(runner, [
        "import asyncio, importlib.util, json, sys",
        `spec=importlib.util.spec_from_file_location("candidate", ${JSON.stringify(`${root}/${entrypoint}`)})`,
        "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)",
        `fn=getattr(module, ${JSON.stringify(functionName)})`,
        "value=fn(json.load(sys.stdin))",
        "if asyncio.iscoroutine(value): value=asyncio.run(value)",
        "print(json.dumps(value, separators=(',', ':')))",
      ].join("\n"));
      command = `python3 ${runner}`;
    } else {
      const runner = `${root}/__verity_runner.${language === "typescript" ? "ts" : "mjs"}`;
      await sandbox.files.write(runner, [
        "import fs from 'node:fs';",
        `import * as candidate from './${entrypoint}';`,
        `const fn=candidate[${JSON.stringify(functionName)}];`,
        "if(typeof fn !== 'function') throw new Error('missing candidate function');",
        "const input=JSON.parse(fs.readFileSync(0,'utf8'));",
        "async function main(){process.stdout.write(JSON.stringify(await fn(input)));}",
        "void main();",
      ].join("\n"));
      command = `${language === "typescript" ? "tsx" : "node"} ${runner}`;
    }
    const handle = await sandbox.commands.run(command, {
      cwd: root,
      timeoutMs: limits.timeoutMs,
      background: true,
      stdin: true,
    });
    await handle.sendStdin(JSON.stringify(input));
    await handle.closeStdin();
    const execution = await handle.wait();
    const stdout = String(execution.stdout ?? "");
    if (execution.exitCode !== 0 || Buffer.byteLength(stdout) > limits.maxOutputBytes) {
      return { ok: false, errorCode: execution.exitCode === 0 ? "SUBMISSION_INVALID" : "GRADER_COMPILE_FAILURE", sandboxId: sandbox.sandboxId };
    }
    try { return { ok: true, output: JSON.parse(stdout), sandboxId: sandbox.sandboxId }; }
    catch { return { ok: false, errorCode: "SUBMISSION_INVALID", sandboxId: sandbox.sandboxId }; }
  } catch (error) {
    return { ok: false, errorCode: /timeout/i.test(error instanceof Error ? error.message : "") ? "GRADER_TIMEOUT" : "SUBMISSION_INVALID", sandboxId: sandbox?.sandboxId };
  } finally {
    if (sandbox) await sandbox.kill().catch(() => undefined);
  }
}
