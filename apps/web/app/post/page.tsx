import type { Metadata } from "next";
import { PostWizard } from "@/components/post-wizard/post-wizard";

export const metadata: Metadata = {
  title: "Post a problem — Verity",
  description: "Define the problem, seal the grader, prove it's solvable, fund the bounty.",
};

export default function PostProblemPage() {
  return <PostWizard />;
}
