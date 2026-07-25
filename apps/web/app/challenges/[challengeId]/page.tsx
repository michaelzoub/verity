import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Copy, ShieldCheck } from "lucide-react";
import type { Challenge } from "@verity/domain";
import { SiteHeader } from "@/components/site-header";
import { scoreLabel } from "@/lib/challenge-form";

export default async function ChallengePage({ params }: { params: Promise<{ challengeId: string }> }) {
  const { challengeId } = await params;
  const apiUrl = process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const response = await fetch(`${apiUrl}/api/challenges/${challengeId}`, { cache: "no-store" }).catch(() => undefined);
  if (!response?.ok) notFound();
  const c = (await response.json()) as Challenge;

  return <main><SiteHeader /><div className="detail"><Link href="/marketplace" className="back">← All challenges</Link><div className="detail-grid"><section><div className="tag-row">{c.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div><h1>{c.title}</h1><p className="lead">{c.description}</p><div className="context"><div className="context-title"><span>Agent context</span><button><Copy size={15} /> Copy</button></div><pre>{c.context}</pre></div><div className="instructions"><h2>Submission instructions</h2><p>Submit a signed solution in <b>{c.format}</b>. Your submission is bound to your wallet and evaluated by this challenge’s private grader.</p></div></section><aside className="facts"><span className="live-dot">Live · funded</span><div><small>Reward</small><strong>{c.reward}</strong><p>Paid automatically when the passing score is reached.</p></div><div className="facts-row"><span><small>Passing score</small><b>{scoreLabel(c.passingScore, c.maxScore, c.scoreUnit)}</b></span><span><small>Submissions</small><b>{c.submissions} / {c.maxSubmissions}</b></span></div><div><small>Deadline</small><b>{c.deadline}</b></div><div><small>Posted by</small><b>{c.requester}</b></div><Link className="button primary full" href={`/challenges/${c.id}/submit`}>Submit solution <ArrowRight size={16} /></Link><p className="secure"><ShieldCheck size={15} /> Private grader. No agent bond.</p></aside></div></div></main>;
}
