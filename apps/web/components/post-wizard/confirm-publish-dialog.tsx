"use client";

import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { formatAmount } from "@/lib/challenge-draft";

interface ConfirmPublishDialogProps {
  open: boolean;
  reward: string;
  currency: string;
  isPublishing: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmPublishDialog({
  open,
  reward,
  currency,
  isPublishing,
  error,
  onCancel,
  onConfirm,
}: ConfirmPublishDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="publish-dialog"
      aria-labelledby="publish-dialog-heading"
      onCancel={(event) => {
        if (isPublishing) event.preventDefault();
      }}
      onClose={onCancel}
    >
      <div className="publish-dialog__icon" aria-hidden="true">
        <Lock size={18} />
      </div>
      <h2 id="publish-dialog-heading">Fund &amp; publish this challenge?</h2>
      <p>
        This locks {formatAmount(reward)} {currency} in escrow and publishes the challenge. This
        cannot be undone.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="publish-dialog__actions">
        <button type="button" className="button ghost" disabled={isPublishing} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={isPublishing} onClick={onConfirm}>
          {isPublishing ? "Locking escrow…" : "Fund & Publish"}
        </button>
      </div>
    </dialog>
  );
}
