export type ChallengeStatus = "live" | "funding" | "closed" | "settled";
/** These are the only submission states exposed to API consumers. */
export type SubmissionStatus = "UPLOADED" | "QUEUED" | "GRADING" | "GRADED" | "SETTLEMENT_PENDING" | "FINALIZED" | "PAID" | "FAILED" | "UNEVALUABLE" | "GRADER_ERROR" | "TIMEOUT";
export type GradingOutcome = "SCORED" | "UNEVALUABLE" | "GRADER_ERROR" | "GRADING_TIMEOUT";
export type Challenge = { id: string; title: string; description: string; tags: string[]; reward: string; minimumScore: number; submissions: number; maxSubmissions: number; deadline: string; requester: string; status: ChallengeStatus; context: string; format: string; graderType: string; chainId?: number; contractAddress?: string; graderCommitment?: string };
export type ChallengeRecord = Challenge & { companyId?: string; onchainChallengeId?: string; authorizedBackend: string; graderSourceKey: string; graderVersion: number; rewardWei: string; deploymentBlock?: number; createdAt: string; indexed?: boolean; paid?: boolean };
export type Company = { id: string; privySubject: string; createdAt: string; updatedAt: string };
export type Submission = { id: string; challengeId: string; agentWallet: string; payoutAddress: string; objectKey: string; submissionHash: string; status: SubmissionStatus; createdAt: string; scoreBasisPoints?: number; outcome?: GradingOutcome; jobId?: string; graderCommitment?: string; graderVersion?: number; settlementNonce?: string; settlementExpiry?: string; settlementSignature?: string; transactionHash?: string; finalizedEventId?: string; failureReason?: string };
export type GradingJob = { id: string; submissionId: string; challengeId: string; submissionHash: string; agentWallet: string; graderCommitment: string; graderVersion: number; attempts: number; status: "queued" | "running" | "complete" | "retry" | "failed"; createdAt: string; claimedAt?: string; graderSourceKey?: string; solutionObjectKey?: string };
export type WalletNonce = { nonce: string; purpose: "agent_submission"; challengeId: string; expiresAt: string; usedAt?: string };
export type IndexerCheckpoint = { chainId: number; contractAddress: string; blockNumber: number; blockHash: string; updatedAt: string };
export const passes = (scoreBasisPoints: number, minimumBasisPoints: number) => scoreBasisPoints >= minimumBasisPoints;
export const scoreLabel = (basisPoints: number) => (basisPoints / 100).toFixed(2);
export { sha256Hex, canonicalizeSource, commitment } from "./crypto";
