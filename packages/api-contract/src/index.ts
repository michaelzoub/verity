import { z } from "zod";
export const createChallengeSchema = z.object({ title: z.string().min(3), description: z.string().min(10), tags: z.array(z.string()).min(1), agentContext: z.string().min(1), minimumScore: z.number().int().min(0).max(10000), rewardWei: z.string(), maxSubmissions: z.number().int().positive(), deadline: z.string(), requester: z.string() });
export const submitSolutionSchema = z.object({ challengeId: z.string(), agentWallet: z.string(), submissionHash: z.string(), signature: z.string(), payload: z.unknown() });
