import type { ChallengeDraft, VerificationResult } from "@/lib/challenge-draft";

const VERIFY_DELAY_MS = 2400;
const PUBLISH_DELAY_MS = 1100;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs the org's own reference solution through the grader so nobody funds an
 * impossible bounty. Mocked: always passes.
 */
export async function verifyReferenceSolution(file: File): Promise<VerificationResult> {
  // TODO: call grading sandbox — upload `file` to the isolated grader worker and
  // return its real outcome instead of this fixed pass.
  void file;
  await wait(VERIFY_DELAY_MS);
  return { passed: true, score: 0.94 };
}

/** Locks the reward in escrow and publishes the listing. Mocked: no chain call. */
export async function fundAndPublish(draft: ChallengeDraft): Promise<{ challengeId: string }> {
  // TODO: wallet connection + escrow contract call — fund the challenge onchain,
  // then POST the draft through the company API so the listing is persisted.
  void draft;
  await wait(PUBLISH_DELAY_MS);
  return { challengeId: `chal_${Math.random().toString(36).slice(2, 10)}` };
}
