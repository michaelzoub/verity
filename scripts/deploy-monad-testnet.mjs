import { spawn } from "node:child_process";

for (const key of ["RPC_URL", "DEPLOYER_ACCOUNT"]) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
const child = spawn("forge", [
  "script", "script/DeployMonadTestnet.s.sol:DeployMonadTestnet",
  "--rpc-url", process.env.RPC_URL,
  "--account", process.env.DEPLOYER_ACCOUNT,
  "--broadcast",
], { cwd: "contracts", stdio: "inherit", env: process.env });
child.on("error", error => { throw error; });
const code = await new Promise(resolve => child.on("exit", resolve));
if (code !== 0) process.exit(Number(code ?? 1));
