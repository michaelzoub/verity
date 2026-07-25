import { existsSync } from "node:fs";
const required = ["artifacts/openapi/openapi.json", "artifacts/contracts/ChallengeEscrow.json"];
const missing = required.filter((path) => !existsSync(path));
if (missing.length) { console.error(`Missing generated artifacts: ${missing.join(", ")}`); process.exit(1); }
console.log("Generated artifacts present.");
