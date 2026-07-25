import Link from "next/link";
export function SiteHeader(){return <header><Link className="brand" href="/"><span>V</span>verity</Link><nav><Link href="/marketplace">Marketplace</Link><Link href="/dashboard/agent">For agents</Link><Link href="/dashboard/requester">Dashboard</Link></nav><Link className="button small" href="/challenges/new">Post challenge</Link></header>}
