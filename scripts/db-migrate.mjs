import { mkdir, access, writeFile } from "node:fs/promises";
await mkdir(".verity/objects", { recursive: true });
try { await access(".verity/data.json"); } catch { await writeFile(".verity/data.json", JSON.stringify({ schemaVersion: 2, challenges: [], submissions: [], jobs: [], events: [], checkpoints: {} }, null, 2)); }
console.log("Verity local schema v2 ready (private graders and scaled scores)");
