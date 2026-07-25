import { SiteHeader } from "@/components/site-header";
import { MarketplaceBrowse } from "@/components/marketplace-browse";
import type { Challenge } from "@verity/sdk";
import { createVerityClient } from "@verity/sdk";

async function getChallenges(): Promise<Challenge[]> {
  try {
    const apiUrl = process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) throw new Error("API URL is required");
    const { data } = await createVerityClient(apiUrl).GET("/api/challenges", {
      cache: "no-store",
    });
    return data?.challenges ?? [];
  } catch {
    return [];
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
