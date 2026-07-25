"use client";

import { useCallback, useState } from "react";
import type { ChallengeDraft, DraftErrors } from "@/lib/challenge-draft";

type TouchedFields = Partial<Record<keyof ChallengeDraft, boolean>>;

/**
 * Step validation runs on every keystroke, but a field only surfaces its error
 * once the person has actually interacted with it.
 */
export function useTouched(errors: DraftErrors) {
  const [touched, setTouched] = useState<TouchedFields>({});

  const touch = useCallback((field: keyof ChallengeDraft) => {
    setTouched((current) => ({ ...current, [field]: true }));
  }, []);

  function errorFor(field: keyof ChallengeDraft) {
    return touched[field] ? errors[field] : undefined;
  }

  return { touch, errorFor };
}
