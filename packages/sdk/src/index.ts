import { createChallengeSchema } from "@verity/api-contract";
export const api = { validateChallenge: (payload: unknown) => createChallengeSchema.parse(payload) };
