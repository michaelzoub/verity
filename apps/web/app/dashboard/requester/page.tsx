"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Challenge } from "@verity/sdk";
import { SiteHeader } from "@/components/site-header";
import { useCompanyApi } from "@/components/company-auth";

export default function RequesterDashboard() {
  const api = useCompanyApi();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [status, setStatus] = useState("Sign in with Privy to load company-owned challenges.");

  useEffect(() => {
    if (!api.authenticated) return;
    let active = true;
    api.request("/api/company/challenges")
      .then(value => {
        if (!active) return;
        const result = value as { challenges?: Challenge[] };
        setChallenges(result.challenges ?? []);
        setStatus(result.challenges?.length ? "" : "No company challenges yet.");
      })
      .catch(error => {
        if (active) setStatus(error instanceof Error ? error.message : "Could not load company challenges.");
      });
    return () => { active = false; };
  }, [api]);

  return (
    <main>
      <SiteHeader />
      <section className="page-head">
        <span className="eyebrow">Requester dashboard</span>
        <h1>Funded work, at a glance.</h1>
        <p>Only the Privy-authenticated company can load its funding and indexed challenge projections.</p>
        {!api.authenticated && <button className="button primary" onClick={api.login}>Sign in as a company</button>}
        {status && <p className="status-line" role="status">{status}</p>}
      </section>
      {challenges.length > 0 && <section className="table-card">
        <h2>Company challenges</h2>
        <div className="table-row table-head"><span>Challenge</span><span>Status</span><span>Submissions</span><span>Reward</span></div>
        {challenges.map(challenge => (
          <Link href={challenge.status === "funding" ? "/challenges/new" : `/challenges/${challenge.id}`} className="table-row" key={challenge.id}>
            <b>{challenge.title}</b><span>{challenge.status}</span><span>{challenge.submissions}/{challenge.maxSubmissions}</span><span>{challenge.reward}</span>
          </Link>
        ))}
      </section>}
    </main>
  );
}
