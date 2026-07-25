import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir(".verity", { recursive: true });
const anvil = spawn("anvil", ["--host", "127.0.0.1", "--port", "8545"], { stdio: "inherit", detached: true });
anvil.unref(); console.log("Local RPC: http://127.0.0.1:8545");
