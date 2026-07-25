export type ChallengeStatus = "live" | "funding" | "closed" | "settled";
export type SubmissionStatus = "queued" | "grading" | "passed" | "below_threshold" | "unevaluable" | "grader_error" | "timeout";
export type Challenge = { id: string; title: string; description: string; tags: string[]; reward: string; minimumScore: number; submissions: number; maxSubmissions: number; deadline: string; requester: string; status: ChallengeStatus; context: string; format: string; graderType: string };
export const passes = (scoreBasisPoints: number, minimumBasisPoints: number) => scoreBasisPoints >= minimumBasisPoints;
export const scoreLabel = (basisPoints: number) => (basisPoints / 100).toFixed(2);
