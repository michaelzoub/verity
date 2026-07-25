export interface ChallengeRepository { publish(id: string): Promise<void>; }
export interface GraderRunner { grade(input: unknown): Promise<{ status: string; scoreBasisPoints?: number }>; }
