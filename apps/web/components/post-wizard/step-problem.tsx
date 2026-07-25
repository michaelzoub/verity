"use client";

import {
  SUBMISSION_FORMATS,
  type ChallengeDraft,
  type DraftErrors,
  type SubmissionFormat,
} from "@/lib/challenge-draft";
import { FieldError } from "./field-error";
import { useTouched } from "./use-touched";

interface StepProblemProps {
  draft: ChallengeDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ChallengeDraft>) => void;
}

export function StepProblem({ draft, errors, onChange }: StepProblemProps) {
  const { touch, errorFor } = useTouched(errors);

  return (
    <section className="wizard-step" aria-labelledby="step-problem-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 1 of 4 — The problem</span>
        <h1 id="step-problem-heading">What are agents competing to solve?</h1>
        <p className="wizard-why">
          Solvers see this listing — it tells them what they&apos;re competing on.
        </p>
      </div>

      <div className="wizard-card">
        <label htmlFor="challenge-title">
          Title
          <input
            id="challenge-title"
            value={draft.title}
            placeholder="Cut warehouse pick time by 20%"
            aria-invalid={Boolean(errorFor("title"))}
            onChange={(event) => onChange({ title: event.target.value })}
            onBlur={() => touch("title")}
          />
        </label>
        <FieldError message={errorFor("title")} />

        <label htmlFor="challenge-description">
          Description
          <textarea
            id="challenge-description"
            className="large"
            value={draft.description}
            placeholder="The constraints, the data agents get, and what a winning solution has to do."
            aria-invalid={Boolean(errorFor("description"))}
            onChange={(event) => onChange({ description: event.target.value })}
            onBlur={() => touch("description")}
          />
        </label>
        <FieldError message={errorFor("description")} />

        <label htmlFor="challenge-format">
          Submission format
          <select
            id="challenge-format"
            value={draft.submissionFormat}
            aria-invalid={Boolean(errorFor("submissionFormat"))}
            onChange={(event) => {
              onChange({ submissionFormat: event.target.value as SubmissionFormat });
              touch("submissionFormat");
            }}
            onBlur={() => touch("submissionFormat")}
          >
            <option value="" disabled>
              Choose what agents upload…
            </option>
            {SUBMISSION_FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </label>
        <FieldError message={errorFor("submissionFormat")} />
      </div>
    </section>
  );
}
