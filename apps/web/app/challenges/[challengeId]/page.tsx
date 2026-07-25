import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { createVerityClient, type Challenge } from "@verity/sdk";
import { SiteHeader } from "@/components/site-header";
import { scoreLabel } from "@/lib/challenge-form";

export default async function ChallengePage({ params }: { params: Promise<{ challengeId: string }> }) {
  const { challengeId } = await params;
  const apiUrl = process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) throw new Error("API URL is required");
  const result = await createVerityClient(apiUrl).GET("/api/challenges/{challengeId}", {
    params: { path: { challengeId } },
    cache: "no-store",
  }).catch(() => undefined);
  if (!result?.data) notFound();
  const challenge: Challenge = result.data;
  const spec = challenge.publicSpec;

  return (
    <main>
      <SiteHeader />
      <div className="detail">
        <Link href="/marketplace" className="back">← All challenges</Link>
        <div className="detail-grid">
          <section>
            <div className="tag-row">{challenge.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
            <h1>{challenge.title}</h1>
            <p className="lead">{spec.problemDescription}</p>
            <div className="instructions">
              <h2>Success criteria</h2>
              <p>{spec.successCriteria}</p>
              <h2>Submission format</h2>
              <p>{spec.submissionFormat}</p>
              <p><b>Runtime:</b> {spec.runtimeVersion} · <b>Entrypoint:</b> {spec.entrypoint}</p>
              <p><b>Allowed dependencies:</b> {spec.allowedDependencies.length ? spec.allowedDependencies.join(", ") : "None"}</p>
              <h2>Required public functions</h2>
              {spec.requiredFunctions.map(fn => (
                <div key={fn.name}>
                  <b>{fn.name}</b>
                  <pre>{JSON.stringify({ input: fn.inputSchema, output: fn.outputSchema }, null, 2)}</pre>
                </div>
              ))}
              <h2>Public examples</h2>
              <pre>{JSON.stringify(spec.examples, null, 2)}</pre>
              {spec.starterCode !== undefined && <><h2>Starter code</h2><pre>{spec.starterCode}</pre></>}
            </div>
          </section>
          <aside className="facts">
            <span className="live-dot">{challenge.status === "live" ? "Live · funded" : challenge.status}</span>
            <div><small>Reward</small><strong>{challenge.reward}</strong><p>Paid automatically to the verified payout wallet.</p></div>
            <div className="facts-row">
              <span><small>Passing score</small><b>{scoreLabel(challenge.passingScore, challenge.maxScore, challenge.scoreUnit)}</b></span>
              <span><small>Submissions</small><b>{challenge.submissions} / {challenge.maxSubmissions}</b></span>
            </div>
            <div><small>Deadline</small><b>{new Date(challenge.deadline).toLocaleString()}</b></div>
            <div><small>Funded by</small><b>{challenge.requester}</b></div>
            {challenge.status === "live" && <Link className="button primary full" href={`/challenges/${challenge.id}/submit`}>Submit source files <ArrowRight size={16} /></Link>}
            <p className="secure"><ShieldCheck size={15} /> Private grader. Public specification only.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
