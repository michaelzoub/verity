export type SubmissionFormat = "code-patch" | "prediction-file" | "model-file" | "other";

export const SUBMISSION_FORMATS: ReadonlyArray<{ value: SubmissionFormat; label: string }> = [
  { value: "code-patch", label: "Code patch" },
  { value: "prediction-file", label: "Prediction file" },
  { value: "model-file", label: "Model file" },
  { value: "other", label: "Other" },
];

export interface DraftFile {
  id: string;
  name: string;
  size: number;
}

export interface VerificationResult {
  passed: boolean;
  score: number;
}

/** Everything the wizard collects across its four steps. Nothing is persisted. */
export interface ChallengeDraft {
  title: string;
  description: string;
  submissionFormat: SubmissionFormat | "";
  scoringMetric: string;
  passingThreshold: string;
  sealedFiles: DraftFile[];
  referenceSolution?: DraftFile;
  verification?: VerificationResult;
  rewardAmount: string;
  rewardCurrency: string;
  deadline: string;
  maxSubmissionsPerAgent: string;
}

export const WIZARD_STEPS = [
  { id: 1, label: "The problem" },
  { id: 2, label: "The grader" },
  { id: 3, label: "Prove it" },
  { id: 4, label: "Fund & publish" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["id"];

export const LAST_STEP: WizardStep = 4;

export type DraftErrors = Partial<Record<keyof ChallengeDraft, string>>;

export function createEmptyDraft(): ChallengeDraft {
  return {
    title: "",
    description: "",
    submissionFormat: "",
    scoringMetric: "",
    passingThreshold: "",
    sealedFiles: [],
    rewardAmount: "",
    rewardCurrency: "USDC",
    deadline: "",
    maxSubmissionsPerAgent: "10",
  };
}

export function submissionFormatLabel(value: SubmissionFormat | ""): string {
  return SUBMISSION_FORMATS.find((format) => format.value === value)?.label ?? "Not set";
}

export function toDraftFile(file: File): DraftFile {
  const suffix = Math.random().toString(36).slice(2, 8);
  return { id: `${file.name}-${file.size}-${suffix}`, name: file.name, size: file.size };
}

/** Locale-pinned so server and client markup always agree. */
const amountFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatAmount(value: string): string {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? amountFormatter.format(parsed) : "0";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Local calendar date as YYYY-MM-DD, matching what `<input type="date">` emits. */
function localIsoDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIso(): string {
  return localIsoDate(new Date());
}

export function tomorrowIso(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localIsoDate(tomorrow);
}

function isPositiveNumber(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
}

export function validateProblem(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = "Give the problem a title agents can scan.";
  if (!draft.description.trim()) errors.description = "Describe what a good solution looks like.";
  if (!draft.submissionFormat) errors.submissionFormat = "Pick the artifact agents will submit.";
  return errors;
}

export function validateGrader(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.scoringMetric.trim()) errors.scoringMetric = "Solvers need the metric in plain text.";
  if (draft.passingThreshold.trim() === "" || !Number.isFinite(Number(draft.passingThreshold))) {
    errors.passingThreshold = "Set the score a submission must beat.";
  }
  if (draft.sealedFiles.length === 0) errors.sealedFiles = "Add at least one sealed answer file.";
  return errors;
}

export function validateProof(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.verification?.passed) {
    errors.verification = "Verify a reference solution against your grader.";
  }
  return errors;
}

export function validateFunding(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!isPositiveNumber(draft.rewardAmount)) errors.rewardAmount = "Enter a reward above zero.";
  if (!draft.deadline) errors.deadline = "Choose a deadline.";
  else if (draft.deadline <= todayIso()) errors.deadline = "The deadline has to be in the future.";

  const maxSubmissions = Number(draft.maxSubmissionsPerAgent);
  if (!isPositiveNumber(draft.maxSubmissionsPerAgent) || !Number.isInteger(maxSubmissions)) {
    errors.maxSubmissionsPerAgent = "Use a whole number of attempts.";
  }
  return errors;
}

export function validateStep(step: WizardStep, draft: ChallengeDraft): DraftErrors {
  if (step === 1) return validateProblem(draft);
  if (step === 2) return validateGrader(draft);
  if (step === 3) return validateProof(draft);
  return validateFunding(draft);
}

export function isStepComplete(step: WizardStep, draft: ChallengeDraft): boolean {
  return Object.keys(validateStep(step, draft)).length === 0;
}
