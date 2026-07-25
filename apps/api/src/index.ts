import { createChallengeSchema } from "@verity/api-contract";
console.log("Verity API mock listening on http://localhost:4000");
console.log("Challenge schema ready:", createChallengeSchema.shape.title._def.typeName);
