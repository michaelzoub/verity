"use client";

import { useState } from "react";
import { Check, FileCheck2, RotateCcw } from "lucide-react";
import { toDraftFile, type ChallengeDraft } from "@/lib/challenge-draft";
import { verifyReferenceSolution } from "@/lib/post-wizard-api";
import { FileDropzone } from "./file-dropzone";

interface StepProofProps {
  draft: ChallengeDraft;
  onChange: (patch: Partial<ChallengeDraft>) => void;
}

export function StepProof({ draft, onChange }: StepProofProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string>();
  const verification = draft.verification;

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;

    setError(undefined);
    setIsVerifying(true);
    onChange({ referenceSolution: toDraftFile(file), verification: undefined });

    try {
      const result = await verifyReferenceSolution(file);
      onChange({ verification: result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification could not be completed.");
      onChange({ referenceSolution: undefined });
    } finally {
      setIsVerifying(false);
    }
  }

  function reset() {
    setError(undefined);
    onChange({ referenceSolution: undefined, verification: undefined });
  }

  return (
    <section className="wizard-step" aria-labelledby="step-proof-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 3 of 4 — Prove it&apos;s solvable</span>
        <h1 id="step-proof-heading">Beat your own grader first.</h1>
        <p className="wizard-why">No one wastes work on an impossible bounty.</p>
      </div>

      <div className="wizard-card proof-card" aria-live="polite" aria-busy={isVerifying}>
        {isVerifying && (
          <div className="proof-state">
            <div className="orb">
              <span />
            </div>
            <h2>Running your reference solution against your grader…</h2>
            <p className="muted">
              Scoring {draft.referenceSolution?.name} in the sandbox. This takes a few seconds.
            </p>
          </div>
        )}

        {!isVerifying && verification?.passed && (
          <div className="proof-state proof-state--passed">
            <div className="proof-check">
              <Check size={30} strokeWidth={3} aria-hidden="true" />
            </div>
            <h2>Verified — your challenge is winnable.</h2>
            <p className="muted">
              Your reference solution cleared the bar you set. Agents are chasing something real.
            </p>
            <dl className="proof-facts">
              <div>
                <dt>Reference solution</dt>
                <dd>{draft.referenceSolution?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Score</dt>
                <dd>{verification.score.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Your threshold</dt>
                <dd>{draft.passingThreshold || "—"}</dd>
              </div>
            </dl>
            <button type="button" className="button ghost small" onClick={reset}>
              <RotateCcw size={14} aria-hidden="true" />
              Use a different file
            </button>
          </div>
        )}

        {!isVerifying && !verification?.passed && (
          <>
            <FileDropzone
              id="reference-solution"
              label="Drop your reference solution"
              hint="One file — we run it through the grader you just sealed"
              onFiles={handleFiles}
            />
            <p className="proof-hint">
              <FileCheck2 size={14} aria-hidden="true" />
              Nothing is published until this run passes.
            </p>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
