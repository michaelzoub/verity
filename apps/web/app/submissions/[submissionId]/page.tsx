"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { Submission } from "@verity/sdk";
import { SiteHeader } from "@/components/site-header";
import { publicApi } from "@/lib/verity-api";

const terminal = new Set(["PAID", "FINALIZED", "NO_PAYOUT", "FAILED", "UNEVALUABLE", "GRADER_ERROR", "TIMEOUT"]);

export default function SubmissionPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [submission, setSubmission] = useState<Submission>();
  const [error, setError] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!apiUrl) return setError("API URL is not configured.");
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { data: body } = await publicApi.GET("/api/submissions/{submissionId}", {
          params: { path: { submissionId } },
          cache: "no-store",
        });
        if (!body?.submission) throw new Error("Submission not found.");
        if (!active) return;
        setSubmission(body.submission);
        if (!terminal.has(body.submission.status)) timer = setTimeout(poll, 1500);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load submission.");
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [apiUrl, submissionId]);

  const paid = submission?.status === "PAID";
  const failed = Boolean(error) || Boolean(submission && ["NO_PAYOUT", "FAILED", "UNEVALUABLE", "GRADER_ERROR", "TIMEOUT", "FINALIZED"].includes(submission.status));
  const Icon = paid ? CheckCircle2 : failed ? XCircle : Clock3;

  return (
    <main>
      <SiteHeader />
      <div className="result">
        <Icon />
        <span className="eyebrow">{error ? "Result unavailable" : paid ? "Finalized and paid on Monad" : failed ? "Finalized without payout" : "Production grading in progress"}</span>
        <h1>{error ? "Could not load result." : paid ? "Passed. Reward settled." : failed ? "No payout." : submission?.status ?? "Loading…"}</h1>
        <p>{error || (paid
          ? "The challenge threshold was met and the escrow paid the verified wallet automatically."
          : failed ? "The submission did not produce a payable finalized result." : "The isolated grader and confirmed indexer determine this state. This page does not simulate progress.")}</p>
        {submission && <div className="result-score">
          <span>Public normalized score</span>
          <strong>{submission.score ?? "—"}</strong>
          <b>Status: {submission.status}</b>
        </div>}
        {submission && <div className="result-meta">
          <span>Submission <b>{submission.id.slice(0, 8)}</b></span>
          <span>Payout wallet <b>{submission.payoutAddress.slice(0, 8)}…{submission.payoutAddress.slice(-6)}</b></span>
          <span>Transaction <b>{submission.transactionHash ? `${submission.transactionHash.slice(0, 10)}…` : "pending"}</b></span>
        </div>}
        {submission && <Link className="button ghost" href={`/challenges/${submission.challengeId}`}>Back to challenge</Link>}
      </div>
    </main>
  );
}
