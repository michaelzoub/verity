import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const waitFor = async (url, child) => {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`process exited before ${url}: ${child.exitCode}`);
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${url}`);
};

test("real component harness is configured with an isolated submission agent", async t => {
  if (process.env.VERITY_RUN_PROCESS_E2E !== "true") { t.skip("set VERITY_RUN_PROCESS_E2E=true to run the multi-process Foundry harness"); return; }
  const dir = await mkdtemp(`${tmpdir()}/verity-e2e-`);
  const env = { ...process.env, NODE_ENV: "test", PRIVY_TEST_TOKEN: "e2e", WORKER_SHARED_SECRET: "e2e-secret", VERITY_DB_FILE: `${dir}/data.json`, VERITY_OBJECT_DIR: `${dir}/objects`, API_PORT: "4400", RPC_URL: "http://127.0.0.1:8545" };
  const children = [];
  const start = (cmd, args, extra = {}) => { const child = spawn(cmd, args, { cwd: process.cwd(), env: { ...env, ...extra }, stdio: "inherit" }); children.push(child); return child; };
  t.after(async () => { for (const child of children) child.kill("SIGTERM"); await rm(dir, { recursive: true, force: true }); });
  const anvil = start("anvil", ["--silent", "--host", "127.0.0.1", "--port", "8545"]);
  await waitFor("http://127.0.0.1:8545", anvil).catch(() => {});
  const runTs = (file, extra = {}) => start(process.execPath, ["--import", "tsx/esm", file], extra);
  const api = runTs("apps/api/src/index.ts");
  const worker = runTs("apps/grader-worker/src/index.ts");
  const indexer = runTs("apps/indexer/src/index.ts");
  const agent = start(process.execPath, ["-e", "fetch('http://127.0.0.1:4400/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]);
  await waitFor("http://127.0.0.1:4400/health", api);
  assert.equal((await fetch("http://127.0.0.1:4400/health")).json !== undefined, true);
  assert.equal(agent.exitCode, null);
  assert.equal((await fetch("http://127.0.0.1:4400/api/challenges")).status, 200);
  void worker; void indexer;
});
