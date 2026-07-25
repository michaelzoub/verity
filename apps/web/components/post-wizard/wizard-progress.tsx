"use client";

import { Check } from "lucide-react";
import {
  WIZARD_STEPS,
  isStepComplete,
  type ChallengeDraft,
  type WizardStep,
} from "@/lib/challenge-draft";

interface WizardProgressProps {
  current: WizardStep;
  draft: ChallengeDraft;
  onSelect: (step: WizardStep) => void;
}

export function WizardProgress({ current, draft, onSelect }: WizardProgressProps) {
  function isReachable(step: WizardStep) {
    if (step <= current) return true;
    return WIZARD_STEPS.filter((entry) => entry.id < step).every((entry) =>
      isStepComplete(entry.id, draft),
    );
  }

  return (
    <ol className="post-stepper" aria-label={`Step ${current} of ${WIZARD_STEPS.length}`}>
      {WIZARD_STEPS.map(({ id, label }) => {
        const isDone = id < current && isStepComplete(id, draft);
        const isActive = id === current;
        const reachable = isReachable(id);

        return (
          <li
            key={id}
            className="post-stepper__step"
            data-state={isActive ? "active" : isDone ? "done" : "todo"}
          >
            <button
              type="button"
              disabled={!reachable || isActive}
              aria-current={isActive ? "step" : undefined}
              onClick={() => onSelect(id)}
            >
              <i aria-hidden="true">{isDone ? <Check size={12} strokeWidth={3} /> : id}</i>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
