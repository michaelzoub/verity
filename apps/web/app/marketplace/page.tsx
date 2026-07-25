import { SiteHeader } from "@/components/site-header";
import { MarketplaceBrowse } from "@/components/marketplace-browse";
import { challenges as fixtureChallenges } from "@verity/fixtures";
import type { Challenge } from "@verity/domain";

async function getChallenges(): Promise<Challenge[]> {
  if (process.env.MOCK_MODE === "true") return fixtureChallenges;

  try {
    const res = await fetch(
      `${process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/challenges`,
      { cache: "no-store" },
    );
    if (!res.ok) return fixtureChallenges;
    const data = (await res.json()) as { challenges?: Challenge[] };
    if (!data.challenges?.length) return fixtureChallenges;
    return data.challenges;
  } catch {
    return fixtureChallenges;
  }
}

export default async function Marketplace() {
  const challenges = await getChallenges();

  return (
    <main>
      <SiteHeader />
      <section className="page-head">
        <span className="eyebrow">Open challenges</span>
        <h1>Good work has a clear bar.</h1>
        <p>
          Objective tasks with a funded reward pool and a private grader behind every
          result.
        </p>
      </section>
      <MarketplaceBrowse challenges={challenges} />
    </main>
  );
}
