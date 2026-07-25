"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  LAST_STEP,
  createEmptyDraft,
  validateStep,
  type ChallengeDraft,
  type WizardStep,
} from "@/lib/challenge-draft";
import { fundAndPublish } from "@/lib/post-wizard-api";
import { ConfirmPublishDialog } from "./confirm-publish-dialog";
import { PublishSuccess } from "./publish-success";
import { StepFunding } from "./step-funding";
import { StepGrader } from "./step-grader";
import { StepProblem } from "./step-problem";
import { StepProof } from "./step-proof";
import { WizardProgress } from "./wizard-progress";

const WIDE_STEPS: ReadonlyArray<WizardStep> = [2, 4];

export function PostWizard() {
  const [draft, setDraft] = useState<ChallengeDraft>(createEmptyDraft);
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [challengeId, setChallengeId] = useState<string>();

  const updateDraft = useCallback((patch: Partial<ChallengeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const errors = useMemo(() => validateStep(step, draft), [step, draft]);
  const canAdvance = Object.keys(errors).length === 0;
  const panelWidth = WIDE_STEPS.includes(step) ? "wide" : "narrow";

  function goToStep(next: WizardStep) {
    if (next === step) return;
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function advance() {
    if (!canAdvance) return;
    if (step === LAST_STEP) {
      setPublishError(undefined);
      setIsConfirmOpen(true);
      return;
    }
    goToStep((step + 1) as WizardStep);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || isConfirmOpen) return;

    const target = event.target as HTMLElement;
    const isMultiline = target.tagName === "TEXTAREA";
    const isOwnControl = target.tagName === "BUTTON" || target.tagName === "A";
    if (isMultiline || isOwnControl || target.isContentEditable) return;

    event.preventDefault();
    advance();
  }

  async function publish() {
    setIsPublishing(true);
    setPublishError(undefined);
    try {
      const result = await fundAndPublish(draft);
      setIsConfirmOpen(false);
      setChallengeId(result.challengeId);
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : "Could not publish the challenge.");
    } finally {
      setIsPublishing(false);
    }
  }

  function restart() {
    setDraft(createEmptyDraft());
    setChallengeId(undefined);
    setDirection("forward");
    setStep(1);
  }

  if (challengeId) {
    return <PublishSuccess challengeId={challengeId} draft={draft} onRestart={restart} />;
  }

  return (
    <main className="post-wizard" onKeyDown={handleKeyDown}>
      <div className="wizard-top">
        <Link className="wizard-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/VERITYLOGO.svg" alt="" width={22} height={22} />
          Post a problem
        </Link>
        <WizardProgress current={step} draft={draft} onSelect={goToStep} />
        <Link className="wizard-exit" href="/marketplace">
          Cancel
        </Link>
      </div>

      <div className="wizard-stage" data-direction={direction}>
        <div className="wizard-panel" key={step} data-width={panelWidth}>
          {step === 1 && <StepProblem draft={draft} errors={errors} onChange={updateDraft} />}
          {step === 2 && <StepGrader draft={draft} errors={errors} onChange={updateDraft} />}
          {step === 3 && <StepProof draft={draft} onChange={updateDraft} />}
          {step === 4 && (
            <StepFunding
              draft={draft}
              errors={errors}
              onChange={updateDraft}
              onEditStep={goToStep}
            />
          )}
        </div>
      </div>

      <div className="wizard-nav">
        <div className="wizard-nav__inner" data-width={panelWidth}>
          <button
            type="button"
            className="button ghost"
            disabled={step === 1}
            onClick={() => goToStep((step - 1) as WizardStep)}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back
          </button>
          <div className="wizard-nav__forward">
            {!canAdvance && <span className="muted">Finish this step to continue</span>}
            <button
              type="button"
              className="button primary"
              disabled={!canAdvance}
              onClick={advance}
            >
              {step === LAST_STEP ? "Fund & Publish" : "Continue"}
              {step !== LAST_STEP && <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      <ConfirmPublishDialog
        open={isConfirmOpen}
        reward={draft.rewardAmount}
        currency={draft.rewardCurrency}
        isPublishing={isPublishing}
        error={publishError}
        onCancel={() => {
          if (!isPublishing) setIsConfirmOpen(false);
        }}
        onConfirm={publish}
      />
    </main>
  );
}
