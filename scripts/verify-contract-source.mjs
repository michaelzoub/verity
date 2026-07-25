import { spawn } from "node:child_process";

if (!process.env.CHALLENGE_FACTORY_ADDRESS) throw new Error("CHALLENGE_FACTORY_ADDRESS is required");
const child = spawn("forge", [
  "verify-contract", process.env.CHALLENGE_FACTORY_ADDRESS,
  "src/ChallengeFactory.sol:ChallengeFactory", "--chain", "10143",
  "--verifier", "sourcify",
  "--verifier-url", "https://sourcify-api-monad.blockvision.org/",
], { cwd: "contracts", stdio: "inherit", env: process.env });
child.on("error", error => { throw error; });
const code = await new Promise(resolve => child.on("exit", resolve));
if (code !== 0) process.exit(Number(code ?? 1));
