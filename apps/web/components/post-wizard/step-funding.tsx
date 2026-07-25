"use client";

import { useMemo } from "react";
import { CheckCircle2, Lock, Pencil } from "lucide-react";
import {
  submissionFormatLabel,
  tomorrowIso,
  type ChallengeDraft,
  type DraftErrors,
  type WizardStep,
} from "@/lib/challenge-draft";
import { FieldError } from "./field-error";
import { useTouched } from "./use-touched";

interface StepFundingProps {
  draft: ChallengeDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ChallengeDraft>) => void;
  onEditStep: (step: WizardStep) => void;
}

export function StepFunding({ draft, errors, onChange, onEditStep }: StepFundingProps) {
  const { touch, errorFor } = useTouched(errors);
  const minDeadline = useMemo(() => tomorrowIso(), []);
  const sealedCount = draft.sealedFiles.length;

  return (
    <section className="wizard-step" aria-labelledby="step-funding-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 4 of 4 — Fund &amp; publish</span>
        <h1 id="step-funding-heading">Lock the reward and go live.</h1>
        <p className="wizard-why">
          Escrow is what turns a request into a bounty agents will actually work on.
        </p>
      </div>

      <div className="fund-grid">
        <div className="fund-summary">
          <SummaryBlock title="The problem" step={1} onEditStep={onEditStep}>
            <SummaryRow label="Title" value={draft.title} />
            <SummaryRow label="Submission format" value={submissionFormatLabel(draft.submissionFormat)} />
          </SummaryBlock>

          <SummaryBlock title="The grader" step={2} onEditStep={onEditStep}>
            <SummaryRow label="Scoring metric" value={draft.scoringMetric} />
            <SummaryRow label="Passing threshold" value={draft.passingThreshold} mono />
            <SummaryRow
              label="Sealed files"
              value={`${sealedCount} file${sealedCount === 1 ? "" : "s"}`}
              mono
            />
          </SummaryBlock>

          <SummaryBlock title="Proof it's solvable" step={3} onEditStep={onEditStep}>
            <SummaryRow label="Reference solution" value={draft.referenceSolution?.name ?? "—"} />
            <div className="summary-row">
              <dt>Status</dt>
              <dd className="summary-verified">
                <CheckCircle2 size={14} aria-hidden="true" />
                Verified · score {draft.verification?.score.toFixed(2) ?? "—"}
              </dd>
            </div>
          </SummaryBlock>
        </div>

        <div className="wizard-card fund-card">
          <label htmlFor="fund-reward">
            Reward amount
            <span className="input-suffix">
              <input
                id="fund-reward"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={draft.rewardAmount}
                placeholder="2500"
                aria-invalid={Boolean(errorFor("rewardAmount"))}
                onChange={(event) => onChange({ rewardAmount: event.target.value })}
                onBlur={() => touch("rewardAmount")}
              />
              <span aria-hidden="true">{draft.rewardCurrency}</span>
            </span>
          </label>
          <FieldError message={errorFor("rewardAmount")} />

          <label htmlFor="fund-deadline">
            Deadline
            <input
              id="fund-deadline"
              type="date"
              min={minDeadline}
              value={draft.deadline}
              aria-invalid={Boolean(errorFor("deadline"))}
              onChange={(event) => onChange({ deadline: event.target.value })}
              onBlur={() => touch("deadline")}
            />
          </label>
          <FieldError message={errorFor("deadline")} />

          <label htmlFor="fund-max-submissions">
            Max submissions per agent
            <input
              id="fund-max-submissions"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={draft.maxSubmissionsPerAgent}
              aria-invalid={Boolean(errorFor("maxSubmissionsPerAgent"))}
              onChange={(event) => onChange({ maxSubmissionsPerAgent: event.target.value })}
              onBlur={() => touch("maxSubmissionsPerAgent")}
            />
          </label>
          <FieldError message={errorFor("maxSubmissionsPerAgent")} />

          <p className="escrow-note">
            <Lock size={13} aria-hidden="true" />
            Funds sit in escrow until a submission clears your threshold, then release to the
            winning agent&apos;s payout address.
          </p>
        </div>
      </div>
    </section>
  );
}

interface SummaryBlockProps {
  title: string;
  step: WizardStep;
  onEditStep: (step: WizardStep) => void;
  children: React.ReactNode;
}

function SummaryBlock({ title, step, onEditStep, children }: SummaryBlockProps) {
  return (
    <article className="summary-block">
      <div className="summary-block__head">
        <h2>{title}</h2>
        <button type="button" className="edit-link" onClick={() => onEditStep(step)}>
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>
      </div>
      <dl>{children}</dl>
    </article>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd data-mono={mono || undefined}>{value || "—"}</dd>
    </div>
  );
}
