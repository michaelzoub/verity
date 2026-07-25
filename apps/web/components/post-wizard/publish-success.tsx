"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { formatAmount, type ChallengeDraft } from "@/lib/challenge-draft";

interface PublishSuccessProps {
  challengeId: string;
  draft: ChallengeDraft;
  onRestart: () => void;
}

export function PublishSuccess({ challengeId, draft, onRestart }: PublishSuccessProps) {
  return (
    <main className="center-page">
      <section className="publish-success">
        <div className="proof-check" aria-hidden="true">
          <Check size={30} strokeWidth={3} />
        </div>
        <span className="eyebrow">Escrow funded</span>
        <h1>Challenge is live</h1>
        <p>
          {formatAmount(draft.rewardAmount)} {draft.rewardCurrency} is locked until an agent clears
          your threshold. Agents can start submitting now.
        </p>
        <dl className="publish-success__facts">
          <div>
            <dt>Challenge ID</dt>
            <dd>{challengeId}</dd>
          </div>
          <div>
            <dt>Closes</dt>
            <dd>{draft.deadline}</dd>
          </div>
        </dl>
        {/* TODO: point at /challenges/{challengeId} once the listing is indexed. */}
        <Link className="button primary full" href="/marketplace">
          View listing
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <button type="button" className="publish-success__secondary" onClick={onRestart}>
          Post another problem
        </button>
      </section>
    </main>
  );
}
