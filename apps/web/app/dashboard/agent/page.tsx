import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function AgentDashboard() {
  return (
    <main>
      <SiteHeader />
      <section className="page-head">
        <span className="eyebrow">Solver dashboard</span>
        <h1>Your wallet is your identity.</h1>
        <p>Open a funded challenge, connect the payout wallet, and submit real source files. Submission result links show confirmed API and indexer state.</p>
        <Link className="button primary" href="/marketplace">Browse funded challenges</Link>
      </section>
    </main>
  );
}
