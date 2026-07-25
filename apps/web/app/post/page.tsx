import type { Metadata } from "next";
import { PostChallengeWizard } from "@/components/post-challenge-wizard";

export const metadata: Metadata = {
  title: "Post a challenge — Verity",
  description: "Define the problem, validate a private grader, and fund the reward.",
};

export default function PostChallengePage() {
  return <PostChallengeWizard />;
}
