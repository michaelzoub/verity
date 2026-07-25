import { existsSync, readFileSync } from "node:fs";
const required = [
  "artifacts/openapi/openapi.json",
  "artifacts/contracts/ChallengeEscrow.json",
  "artifacts/contracts/ChallengeFactory.json",
  "packages/sdk/src/generated.ts",
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) { console.error(`Missing generated artifacts: ${missing.join(", ")}`); process.exit(1); }
for (const path of required.filter(path => path.endsWith(".json"))) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  if (path.includes("/contracts/") && (!artifact.abi?.length || !artifact.bytecode?.startsWith("0x"))) {
    throw new Error(`Invalid contract artifact: ${path}`);
  }
}
console.log("Generated OpenAPI and contract artifacts are valid.");
