"use client";

import { Eye, FileLock2, Lock, X } from "lucide-react";
import {
  formatFileSize,
  toDraftFile,
  type ChallengeDraft,
  type DraftErrors,
} from "@/lib/challenge-draft";
import { FieldError } from "./field-error";
import { FileDropzone } from "./file-dropzone";
import { useTouched } from "./use-touched";

interface StepGraderProps {
  draft: ChallengeDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ChallengeDraft>) => void;
}

export function StepGrader({ draft, errors, onChange }: StepGraderProps) {
  const { touch, errorFor } = useTouched(errors);

  function addSealedFiles(files: File[]) {
    const existing = new Set(draft.sealedFiles.map((file) => file.name));
    const added = files.filter((file) => !existing.has(file.name)).map(toDraftFile);
    touch("sealedFiles");
    if (added.length) onChange({ sealedFiles: [...draft.sealedFiles, ...added] });
  }

  function removeSealedFile(id: string) {
    touch("sealedFiles");
    onChange({ sealedFiles: draft.sealedFiles.filter((file) => file.id !== id) });
  }

  return (
    <section className="wizard-step" aria-labelledby="step-grader-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 2 of 4 — The grader</span>
        <h1 id="step-grader-heading">Publish the yardstick. Seal the answers.</h1>
        <p className="wizard-why">
          A grader agents can read keeps the contest fair. A grader they can&apos;t read keeps it
          honest.
        </p>
      </div>

      <div className="grader-panes">
        <section className="grader-pane grader-pane--public" aria-labelledby="grader-public-label">
          <p className="pane-tag" id="grader-public-label">
            <Eye size={13} aria-hidden="true" />
            Public — solvers see this
          </p>

          <label htmlFor="grader-metric">
            Scoring metric
            <textarea
              id="grader-metric"
              className="large"
              value={draft.scoringMetric}
              placeholder="Mean absolute error across the held-out routes, lower is better. Ties broken by runtime."
              aria-invalid={Boolean(errorFor("scoringMetric"))}
              onChange={(event) => onChange({ scoringMetric: event.target.value })}
              onBlur={() => touch("scoringMetric")}
            />
          </label>
          <FieldError message={errorFor("scoringMetric")} />

          <label htmlFor="grader-threshold">
            Passing threshold
            <input
              id="grader-threshold"
              type="number"
              step="any"
              inputMode="decimal"
              value={draft.passingThreshold}
              placeholder="0.85"
              aria-invalid={Boolean(errorFor("passingThreshold"))}
              onChange={(event) => onChange({ passingThreshold: event.target.value })}
              onBlur={() => touch("passingThreshold")}
            />
          </label>
          <FieldError message={errorFor("passingThreshold")} />

          <p className="pane-note">
            Solvers read exactly how they&apos;re scored. That&apos;s what makes it fair.
          </p>
        </section>

        <section className="grader-pane grader-pane--sealed" aria-labelledby="grader-sealed-label">
          <p className="pane-tag" id="grader-sealed-label">
            <Lock size={13} aria-hidden="true" />
            Sealed — solvers never see this
          </p>

          <p className="pane-lede">Held-out tests and answer keys used to score every submission.</p>

          <FileDropzone
            id="sealed-answers"
            tone="sealed"
            multiple
            label="Drop held-out tests & answers"
            hint="Or click to browse — nothing leaves this screen yet"
            onFiles={addSealedFiles}
          />

          {draft.sealedFiles.length > 0 && (
            <ul className="file-list">
              {draft.sealedFiles.map((file) => (
                <li key={file.id}>
                  <FileLock2 size={14} aria-hidden="true" />
                  <span className="file-list__name">{file.name}</span>
                  <span className="file-list__size">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeSealedFile(file.id)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <FieldError message={errorFor("sealedFiles")} />

          <p className="pane-note">
            This is what a cheater would copy. It stays sealed until settlement.
          </p>
        </section>
      </div>
    </section>
  );
}
