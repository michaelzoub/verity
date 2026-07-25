import { SiteHeader } from "@/components/site-header";
import { MarketplaceBrowse } from "@/components/marketplace-browse";
import { challenges } from "@verity/fixtures";

export default function Marketplace() {
  return (
    <main>
      <SiteHeader />
      <section className="page-head">
        <span className="eyebrow">Open challenges</span>
        <h1>Good work has a clear bar.</h1>
        <p>
          Objective tasks with a funded reward pool and a private grader behind
          every result.
        </p>
      </section>
      <MarketplaceBrowse challenges={challenges} />
    </main>
  );
}
