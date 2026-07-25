"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  FileCode2,
  LoaderCircle,
  Lock,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useCompanyApi } from "@/components/company-auth";
import { companyAuthEnabled } from "@/components/privy-provider";
import {
  languageFromFilename,
  validateGraderSource,
  type GraderLanguage,
} from "@/lib/challenge-form";

type WizardStep = 1 | 2 | 3 | 4;
type SourceMode = "paste" | "upload";
type ScoreDirection = "higher";
type DraftErrors = Record<string, string>;

interface ChallengeDraft {
  title: string;
  description: string;
  successCriteria: string;
  tags: string;
  solverLanguage: GraderLanguage;
  solverRuntime: string;
  solverFilename: string;
  solverEntrypoint: string;
  functionName: string;
  functionSignature: string;
  exampleInput: string;
  expectedOutput: string;
  starterCode: string;
  scoreName: string;
  scoreUnit: string;
  scoreDirection: ScoreDirection;
  passingScore: string;
  minScore: string;
  maxScore: string;
  scoreScale: string;
  graderMode: SourceMode;
  graderSource: string;
  graderFilename: string;
  graderLanguage: GraderLanguage;
  graderRuntime: string;
  graderEntrypoint: string;
  reward: string;
  deadline: string;
  maxSubmissions: string;
  documentationConfirmed: boolean;
}

interface PreflightResult {
  ok: true;
  entrypoint: string;
  validationResult: {
    score: string;
    passed?: boolean;
    feedback: string;
    metadata: Record<string, unknown>;
  };
}

const STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: 1, label: "The problem" },
  { id: 2, label: "The grader" },
  { id: 3, label: "Funding" },
  { id: 4, label: "Confirm" },
];

const DELIVERY_SIGNATURE = `def optimize_routes(problem: dict) -> dict:
    ...`;

const EXAMPLE_INPUT = `{
  "depot": "MTL-01",
  "vehicles": 2,
  "stops": [
    { "id": "A", "demand": 3, "window": [8, 12] },
    { "id": "B", "demand": 2, "window": [9, 14] },
    { "id": "C", "demand": 4, "window": [10, 16] }
  ]
}`;

const EXPECTED_OUTPUT = `{
  "routes": [
    { "vehicle": 1, "stops": ["A", "C"] },
    { "vehicle": 2, "stops": ["B"] }
  ],
  "totalDistanceKm": 42.17
}`;

const PYTHON_STARTER = `def optimize_routes(problem: dict) -> dict:
    """Return valid routes for every stop in the problem."""
    return {
        "routes": [
            {"vehicle": 1, "stops": ["A", "C"]},
            {"vehicle": 2, "stops": ["B"]},
        ],
        "totalDistanceKm": 42.17,
    }
`;

const PYTHON_GRADER = `def grade(run_candidate):
    """Score the candidate output. The envelope fallback keeps current workers compatible."""
    output = (
        run_candidate({"depot": "MTL-01", "vehicles": 2, "stops": []})
        if callable(run_candidate)
        else run_candidate.get("agentFinalOutput", {})
    )
    routes = output.get("routes", [])
    score = 4217.35 if routes else 0
    return {
        "score": str(score),
        "passed": score >= 4000,
        "feedback": "Valid routes across all hidden scenarios.",
        "metadata": {},
    }
`;

const GRADER_INTERFACE = `def grade(run_candidate) -> dict:
    ...`;

function createDraft(): ChallengeDraft {
  return {
    title: "Optimize last-mile delivery routes",
    description:
      "Build a route optimizer that assigns every stop to a vehicle while respecting capacity and delivery windows.",
    successCriteria:
      "Return valid routes for every stop. Solutions are ranked by route quality across public and hidden scenarios.",
    tags: "Logistics, Optimization",
    solverLanguage: "python",
    solverRuntime: "3.12",
    solverFilename: "solution.py",
    solverEntrypoint: "solution.py",
    functionName: "optimize_routes",
    functionSignature: DELIVERY_SIGNATURE,
    exampleInput: EXAMPLE_INPUT,
    expectedOutput: EXPECTED_OUTPUT,
    starterCode: PYTHON_STARTER,
    scoreName: "Route quality",
    scoreUnit: "points",
    scoreDirection: "higher",
    passingScore: "4000",
    minScore: "0",
    maxScore: "10000",
    scoreScale: "100",
    graderMode: "paste",
    graderSource: PYTHON_GRADER,
    graderFilename: "grader.py",
    graderLanguage: "python",
    graderRuntime: "3.12",
    graderEntrypoint: "grade",
    reward: "0.01",
    deadline: "",
    maxSubmissions: "40",
    documentationConfirmed: false,
  };
}

function extensionFor(language: GraderLanguage) {
  return language === "typescript" ? "ts" : language === "javascript" ? "js" : "py";
}

function runtimeFor(language: GraderLanguage) {
  return language === "python" ? "3.12" : "22";
}

function functionNameFromSignature(signature: string) {
  return signature.match(
    /(?:def|function)\s+([A-Za-z_][A-Za-z0-9_]*)|(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/,
  )?.slice(1).find(Boolean);
}

function defaultGrader(language: GraderLanguage) {
  if (language === "python") return PYTHON_GRADER;
  return `export default async function grade(runCandidate: any) {
  const output = typeof runCandidate === "function"
    ? await runCandidate({ depot: "MTL-01", vehicles: 2, stops: [] })
    : runCandidate.agentFinalOutput ?? {};
  const score = Array.isArray(output.routes) && output.routes.length ? 4217.35 : 0;
  return {
    score: String(score),
    passed: score >= 4000,
    feedback: "Valid routes across all hidden scenarios.",
    metadata: {},
  };
}`;
}

function defaultStarter(language: GraderLanguage) {
  if (language === "python") return PYTHON_STARTER;
  const annotation = language === "typescript" ? ": Record<string, unknown>" : "";
  return `export function optimize_routes(problem${annotation}) {
  void problem;
  return {
    routes: [
      { vehicle: 1, stops: ["A", "C"] },
      { vehicle: 2, stops: ["B"] },
    ],
    totalDistanceKm: 42.17,
  };
}`;
}

function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function monToWei(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) {
    throw new Error("Enter a valid MON reward.");
  }
  const [whole, fraction = ""] = value.split(".");
  const wei = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
  if (wei <= 0n) throw new Error("Reward must be greater than zero.");
  return wei.toString();
}

function sourceBase64(source: string) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function graderDefinition(draft: ChallengeDraft) {
  const shared = {
    language: draft.graderLanguage,
    runtimeVersion: draft.graderRuntime,
    entrypoint: draft.graderEntrypoint,
    graderFileName: draft.graderFilename,
    graderConfig: {},
    dependencies: [],
  };
  return draft.graderMode === "upload"
    ? { ...shared, graderSourceBase64: sourceBase64(draft.graderSource) }
    : { ...shared, graderSource: draft.graderSource };
}

function scoring(draft: ChallengeDraft) {
  return {
    passingScore: draft.passingScore,
    minScore: draft.minScore || undefined,
    maxScore: draft.maxScore || undefined,
    scoreScale: Number(draft.scoreScale),
    scoreUnit: draft.scoreUnit,
  };
}

function validationSample(draft: ChallengeDraft) {
  return {
    sourceFiles: [{ path: draft.solverEntrypoint, content: draft.starterCode }],
    language: draft.solverLanguage,
    finalOutput: parseJson(draft.expectedOutput, "Expected output"),
    artifacts: [],
  };
}

function preflightPayload(draft: ChallengeDraft) {
  return {
    ...graderDefinition(draft),
    validationSample: validationSample(draft),
    requiredFunctions: [],
    submissionSchema: { type: "object" },
    scoring: scoring(draft),
  };
}

function publicSpec(draft: ChallengeDraft) {
  const input = parseJson(draft.exampleInput, "Example input");
  const output = parseJson(draft.expectedOutput, "Expected output");
  return {
    problemDescription: draft.description,
    successCriteria: `${draft.successCriteria}\n\nScore: ${draft.scoreName}; ${draft.scoreDirection} is better; passing score ${draft.passingScore} ${draft.scoreUnit}.`,
    language: draft.solverLanguage,
    runtimeVersion: draft.solverRuntime,
    entrypoint: draft.solverEntrypoint,
    requiredFunctions: [
      {
        name: draft.functionName,
        inputSchema: jsonSchemaFor(input),
        outputSchema: jsonSchemaFor(output),
      },
    ],
    submissionFormat: `Upload source code as ${draft.solverFilename}. Export ${draft.functionName} with the documented signature.`,
    allowedDependencies: [],
    scoring: scoring(draft),
    examples: [{ functionName: draft.functionName, input, output }],
    starterCode: draft.starterCode,
    documentationConfirmed: true as const,
  };
}

function jsonSchemaFor(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { type: "array" };
  if (value === null) return { type: "null" };
  if (typeof value !== "object") return { type: typeof value === "number" ? "number" : typeof value };
  const object = value as Record<string, unknown>;
  return {
    type: "object",
    required: Object.keys(object),
    properties: Object.fromEntries(
      Object.entries(object).map(([key, child]) => [key, jsonSchemaFor(child)]),
    ),
  };
}

function validationFingerprint(draft: ChallengeDraft) {
  return JSON.stringify({
    solverLanguage: draft.solverLanguage,
    solverRuntime: draft.solverRuntime,
    solverFilename: draft.solverFilename,
    solverEntrypoint: draft.solverEntrypoint,
    functionName: draft.functionName,
    functionSignature: draft.functionSignature,
    exampleInput: draft.exampleInput,
    expectedOutput: draft.expectedOutput,
    starterCode: draft.starterCode,
    scoreName: draft.scoreName,
    scoreUnit: draft.scoreUnit,
    scoreDirection: draft.scoreDirection,
    passingScore: draft.passingScore,
    minScore: draft.minScore,
    maxScore: draft.maxScore,
    scoreScale: draft.scoreScale,
    graderMode: draft.graderMode,
    graderSource: draft.graderSource,
    graderFilename: draft.graderFilename,
    graderLanguage: draft.graderLanguage,
    graderRuntime: draft.graderRuntime,
    graderEntrypoint: draft.graderEntrypoint,
  });
}

function problemErrors(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.title.trim().length < 3) errors.title = "Use at least 3 characters.";
  if (draft.description.trim().length < 10) errors.description = "Describe the challenge in at least 10 characters.";
  if (draft.successCriteria.trim().length < 3) errors.successCriteria = "Explain what a successful solution does.";
  if (!draft.tags.trim()) errors.tags = "Add at least one tag.";
  return errors;
}

function graderErrors(draft: ChallengeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.solverRuntime.trim()) errors.solverRuntime = "Add the public solver runtime.";
  if (!/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|js|py)$/.test(draft.solverEntrypoint)) {
    errors.solverEntrypoint = "Use a source path such as solution.py.";
  }
  if (!draft.solverFilename.trim()) errors.solverFilename = "Add the solver filename.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.functionName)) errors.functionName = "Use a valid function name.";
  if (!draft.functionSignature.includes(draft.functionName)) errors.functionSignature = "The signature must include the required function name.";
  try {
    parseJson(draft.exampleInput, "Example input");
  } catch (error) {
    errors.exampleInput = (error as Error).message;
  }
  try {
    parseJson(draft.expectedOutput, "Expected output");
  } catch (error) {
    errors.expectedOutput = (error as Error).message;
  }
  if (!draft.starterCode.trim()) errors.starterCode = "Add a public starter or example solution.";
  if (!draft.scoreName.trim()) errors.scoreName = "Name the score.";
  if (!draft.scoreUnit.trim()) errors.scoreUnit = "Add a score unit.";
  if (!Number.isFinite(Number(draft.passingScore))) errors.passingScore = "Enter a numeric passing score.";
  const scale = Number(draft.scoreScale);
  if (!Number.isInteger(scale) || scale < 1 || scale > 1_000_000_000 || !/^10*$/.test(String(scale))) {
    errors.scoreScale = "Use a power of ten between 1 and 1,000,000,000.";
  }
  const sourceError = validateGraderSource(
    draft.graderSource,
    draft.graderLanguage,
    draft.graderEntrypoint,
  );
  if (sourceError) errors.graderSource = sourceError;
  if (!draft.graderFilename.trim()) errors.graderFilename = "Add a grader filename.";
  if (!draft.graderRuntime.trim()) errors.graderRuntime = "Add the private grader runtime.";
  const expectedExtension = `.${extensionFor(draft.graderLanguage)}`;
  if (draft.graderFilename && !draft.graderFilename.toLowerCase().endsWith(expectedExtension)) {
    errors.graderFilename = `Filename must end in ${expectedExtension}.`;
  }
  if (draft.solverLanguage !== draft.graderLanguage || draft.solverRuntime !== draft.graderRuntime) {
    errors.graderRuntime = "The current backend requires public and private runtime settings to match.";
  }
  return errors;
}

function fundingErrors(draft: ChallengeDraft, wallet: string): DraftErrors {
  const errors: DraftErrors = {};
  try {
    monToWei(draft.reward);
  } catch (error) {
    errors.reward = (error as Error).message;
  }
  if (!draft.deadline) errors.deadline = "Choose a deadline.";
  else if (new Date(`${draft.deadline}T23:59:59.000Z`).getTime() <= Date.now()) {
    errors.deadline = "The deadline must be in the future.";
  }
  const max = Number(draft.maxSubmissions);
  if (!Number.isInteger(max) || max < 1) errors.maxSubmissions = "Use a positive whole number.";
  if (!wallet) errors.wallet = "Connect the funding wallet.";
  return errors;
}

export function PostChallengeWizard() {
  const api = useCompanyApi();
  const router = useRouter();
  const [draft, setDraft] = useState<ChallengeDraft>(createDraft);
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const wallet = api.walletAddress;
  const [validatedFingerprint, setValidatedFingerprint] = useState<string>();
  const [preflight, setPreflight] = useState<PreflightResult>();
  const [validationError, setValidationError] = useState<string>();
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>();
  const [walletBalance, setWalletBalance] = useState<string>();
  const creationKey = useRef<string | undefined>(undefined);
  if (!creationKey.current) creationKey.current = crypto.randomUUID();

  useEffect(() => {
    if (!wallet) return setWalletBalance(undefined);
    void api.getWalletProvider()
      .then(provider => provider.request({ method: "eth_getBalance", params: [wallet, "latest"] }))
      .then(value => setWalletBalance(`${(Number(BigInt(String(value))) / 1e18).toFixed(4)} MON`))
      .catch(() => setWalletBalance("Balance unavailable"));
  }, [api, wallet]);

  const updateDraft = useCallback((patch: Partial<ChallengeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const errors = useMemo(() => {
    if (step === 1) return problemErrors(draft);
    if (step === 2) return graderErrors(draft);
    if (step === 3) return fundingErrors(draft, wallet);
    return draft.documentationConfirmed
      ? {}
      : { documentationConfirmed: "Confirm the public specification before publishing." };
  }, [draft, step, wallet]);
  const canAdvance = Object.keys(errors).length === 0;
  const wide = step === 2 || step === 4;

  function touch(field: string) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function visibleError(field: string) {
    return touched[field] ? errors[field] : undefined;
  }

  function goToStep(next: WizardStep) {
    if (next === step) return;
    setDirection(next > step ? "forward" : "back");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function advance() {
    if (!canAdvance) {
      setTouched(Object.fromEntries(Object.keys(errors).map((field) => [field, true])));
      return;
    }
    if (step < 4) goToStep((step + 1) as WizardStep);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || step === 4) return;
    const target = event.target as HTMLElement;
    if (
      target.tagName === "TEXTAREA" ||
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.isContentEditable
    ) {
      return;
    }
    event.preventDefault();
    advance();
  }

  async function uploadGrader(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const language = languageFromFilename(file.name);
    if (!language) {
      setValidationError("Only .ts, .js, and .py grader files are supported.");
      return;
    }
    if (file.size > 256 * 1024) {
      setValidationError("Grader source must be 256 KB or smaller.");
      return;
    }
    updateDraft({
      graderMode: "upload",
      graderFilename: file.name,
      graderLanguage: language,
      graderRuntime: runtimeFor(language),
      graderEntrypoint: language === "python" ? "grade" : "default",
      graderSource: await file.text(),
      solverLanguage: language,
      solverRuntime: runtimeFor(language),
      solverFilename: `solution.${extensionFor(language)}`,
      solverEntrypoint: `solution.${extensionFor(language)}`,
      starterCode: defaultStarter(language),
    });
    setValidationError(undefined);
    touch("graderSource");
  }

  function changeGraderLanguage(language: GraderLanguage) {
    updateDraft({
      graderLanguage: language,
      graderRuntime: runtimeFor(language),
      graderEntrypoint: language === "python" ? "grade" : "default",
      graderFilename: `grader.${extensionFor(language)}`,
      graderSource: defaultGrader(language),
      solverLanguage: language,
      solverRuntime: runtimeFor(language),
      solverFilename: `solution.${extensionFor(language)}`,
      solverEntrypoint: `solution.${extensionFor(language)}`,
      starterCode: defaultStarter(language),
    });
    setValidationError(undefined);
  }

  async function validateGrader() {
    if (!api.authenticated) {
      api.login();
      return;
    }
    const localErrors = graderErrors(draft);
    if (Object.keys(localErrors).length) {
      setTouched((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(localErrors).map((field) => [field, true])),
      }));
      setValidationError("Fix the highlighted fields before validating.");
      return;
    }
    setIsValidating(true);
    setValidationError(undefined);
    setPreflight(undefined);
    try {
      const result = (await api.request("/api/graders/preflight", {
        method: "POST",
        body: JSON.stringify(preflightPayload(draft)),
      })) as PreflightResult;
      setPreflight(result);
      setValidatedFingerprint(validationFingerprint(draft));
    } catch (error) {
      setValidatedFingerprint(undefined);
      setValidationError(
        error instanceof Error ? error.message : "The grader could not be validated.",
      );
    } finally {
      setIsValidating(false);
    }
  }

  async function connectWallet() {
    try {
      setPublishStatus(undefined);
      if (!api.authenticated) return api.login();
      api.connectWallet();
    } catch (error) {
      setPublishStatus(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function publish() {
    if (!canAdvance) return;
    if (!api.authenticated) {
      api.login();
      return;
    }
    setIsPublishing(true);
    setPublishStatus("Creating the validated challenge…");
    try {
      const created = (await api.request("/api/challenges", {
        method: "POST",
        headers: { "Idempotency-Key": creationKey.current! },
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          agentContext: `${draft.successCriteria}\n\nRequired function:\n${draft.functionSignature}`,
          rewardWei: monToWei(draft.reward),
          fundingWallet: wallet,
          maxSubmissions: Number(draft.maxSubmissions),
          deadline: new Date(`${draft.deadline}T23:59:59.000Z`).toISOString(),
          chainId: 10143,
          ...graderDefinition(draft),
          requiredFunctions: [],
          submissionSchema: { type: "object" },
          validationSample: validationSample(draft),
          scoring: scoring(draft),
          publicSpec: publicSpec(draft),
        }),
      })) as {
        challenge: { id: string };
        walletTransaction: { to: string; data: string; value: string; chainId: number };
      };

      setPublishStatus("Confirm the funding transaction in your wallet…");
      const provider = await api.getWalletProvider();
      const transactionHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: wallet,
            to: created.walletTransaction.to,
            data: created.walletTransaction.data,
            value: `0x${BigInt(created.walletTransaction.value).toString(16)}`,
            chainId: `0x${created.walletTransaction.chainId.toString(16)}`,
          },
        ],
      })) as string;

      setPublishStatus(`Transaction pending: ${transactionHash.slice(0, 10)}…`);
      const confirmation = await api.request(`/api/challenges/${created.challenge.id}/funding-confirmed`, {
        method: "POST",
        body: JSON.stringify({ transactionHash }),
      }) as { funding: { blockNumber: number } };
      setPublishStatus(`Funding confirmed in block ${confirmation.funding.blockNumber}. Waiting for publication…`);
      for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
          await api.request(`/api/challenges/${created.challenge.id}`, {
            cache: "no-store",
          });
          router.push(`/challenges/${created.challenge.id}`);
          return;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.includes("HTTP 404: challenge_not_found")
          ) {
            throw error;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      throw new Error("Funding is confirmed, but indexing has not completed yet.");
    } catch (error) {
      setPublishStatus(error instanceof Error ? error.message : "Could not publish the challenge.");
      setIsPublishing(false);
    }
  }

  return (
    <main className="post-wizard" onKeyDown={handleKeyDown}>
      <div className="wizard-top">
        <Link className="wizard-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/VERITYLOGO.svg" alt="" width={22} height={22} />
          Post a challenge
        </Link>
        <WizardProgress
          current={step}
          draft={draft}
          wallet={wallet}
          onSelect={goToStep}
        />
        <Link className="wizard-exit" href="/marketplace">
          Cancel
        </Link>
      </div>

      <div className="wizard-stage" data-direction={direction}>
        <div className="wizard-panel" key={step} data-width={wide ? "wide" : "narrow"}>
          {step === 1 && (
            <ProblemStep
              draft={draft}
              errors={errors}
              visibleError={visibleError}
              touch={touch}
              onChange={updateDraft}
            />
          )}
          {step === 2 && (
            <GraderStep
              draft={draft}
              errors={errors}
              visibleError={visibleError}
              touch={touch}
              isValidating={isValidating}
              isAuthenticated={api.authenticated}
              preflight={preflight}
              validationError={validationError}
              isCurrentValidation={validatedFingerprint === validationFingerprint(draft)}
              onChange={updateDraft}
              onChangeLanguage={changeGraderLanguage}
              onUpload={uploadGrader}
              onValidate={validateGrader}
              onLogin={api.login}
            />
          )}
          {step === 3 && (
            <FundingStep
              draft={draft}
              wallet={wallet}
              walletBalance={walletBalance}
              errors={errors}
              visibleError={visibleError}
              touch={touch}
              isAuthenticated={api.authenticated}
              status={publishStatus}
              onChange={updateDraft}
              onConnectWallet={connectWallet}
              onLogin={api.login}
            />
          )}
          {step === 4 && (
            <ConfirmStep
              draft={draft}
              wallet={wallet}
              preflight={preflight}
              isCurrentValidation={validatedFingerprint === validationFingerprint(draft)}
              error={visibleError("documentationConfirmed")}
              status={publishStatus}
              isPublishing={isPublishing}
              onChange={updateDraft}
              onEdit={goToStep}
              onPublish={publish}
            />
          )}
        </div>
      </div>

      <div className="wizard-nav">
        <div className="wizard-nav__inner" data-width={wide ? "wide" : "narrow"}>
          <button
            type="button"
            className="button ghost"
            disabled={step === 1 || isPublishing}
            onClick={() => goToStep((step - 1) as WizardStep)}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back
          </button>
          <div className="wizard-nav__forward">
            {!canAdvance && <span className="muted">Finish this step to continue</span>}
            {step < 4 && (
              <button
                type="button"
                className="button primary"
                disabled={!canAdvance}
                onClick={advance}
              >
                Continue
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

interface CommonStepProps {
  draft: ChallengeDraft;
  errors: DraftErrors;
  visibleError: (field: string) => string | undefined;
  touch: (field: string) => void;
  onChange: (patch: Partial<ChallengeDraft>) => void;
}

function ProblemStep({ draft, visibleError, touch, onChange }: CommonStepProps) {
  return (
    <section className="wizard-step" aria-labelledby="problem-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 1 of 4 — The problem</span>
        <h1 id="problem-heading">What are solvers competing to solve?</h1>
        <p className="wizard-why">
          This is the public brief. Keep it concrete enough that an agent can start without guessing.
        </p>
      </div>
      <div className="wizard-card">
        <Field
          id="challenge-title"
          label="Challenge title"
          value={draft.title}
          error={visibleError("title")}
          onChange={(value) => onChange({ title: value })}
          onBlur={() => touch("title")}
        />
        <Field
          id="challenge-description"
          label="Problem description"
          value={draft.description}
          error={visibleError("description")}
          multiline
          large
          onChange={(value) => onChange({ description: value })}
          onBlur={() => touch("description")}
        />
        <Field
          id="success-criteria"
          label="Success criteria"
          value={draft.successCriteria}
          error={visibleError("successCriteria")}
          multiline
          onChange={(value) => onChange({ successCriteria: value })}
          onBlur={() => touch("successCriteria")}
        />
        <Field
          id="challenge-tags"
          label="Tags"
          hint="Comma-separated; shown on the marketplace."
          value={draft.tags}
          error={visibleError("tags")}
          onChange={(value) => onChange({ tags: value })}
          onBlur={() => touch("tags")}
        />
      </div>
    </section>
  );
}

interface GraderStepProps extends CommonStepProps {
  isValidating: boolean;
  isAuthenticated: boolean;
  preflight?: PreflightResult;
  validationError?: string;
  isCurrentValidation: boolean;
  onChangeLanguage: (language: GraderLanguage) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onValidate: () => void;
  onLogin: () => void;
}

function GraderStep({
  draft,
  visibleError,
  touch,
  isValidating,
  isAuthenticated,
  preflight,
  validationError,
  isCurrentValidation,
  onChange,
  onChangeLanguage,
  onUpload,
  onValidate,
  onLogin,
}: GraderStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <section className="wizard-step" aria-labelledby="grader-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 2 of 4 — The grader</span>
        <h1 id="grader-heading">Publish the contract. Seal the yardstick.</h1>
        <p className="wizard-why">
          Solvers see the complete delivery contract. Your executable grader stays private and must
          pass a real sandbox preflight.
        </p>
      </div>

      <div className="grader-panes grader-panes--expanded">
        <section className="grader-pane grader-pane--public" aria-labelledby="public-grader-label">
          <p className="pane-tag" id="public-grader-label">
            <Eye size={13} aria-hidden="true" />
            Public — solvers see this
          </p>

          <div className="compact-grid">
            <SelectField
              id="solver-language"
              label="Language"
              value={draft.solverLanguage}
              options={[
                ["python", "Python"],
                ["typescript", "TypeScript"],
                ["javascript", "JavaScript"],
              ]}
              onChange={(value) => onChangeLanguage(value as GraderLanguage)}
            />
            <Field
              id="solver-filename"
              label="Solver filename"
              value={draft.solverFilename}
              error={visibleError("solverFilename")}
              onChange={(value) =>
                onChange({ solverFilename: value, solverEntrypoint: value })
              }
              onBlur={() => touch("solverFilename")}
            />
          </div>
          <Field
            id="function-signature"
            label="Required function signature"
            value={draft.functionSignature}
            error={visibleError("functionSignature")}
            multiline
            code
            onChange={(value) =>
              onChange({
                functionSignature: value,
                functionName: functionNameFromSignature(value) ?? draft.functionName,
              })
            }
            onBlur={() => touch("functionSignature")}
          />
          <Field
            id="example-input"
            label="Example input"
            value={draft.exampleInput}
            error={visibleError("exampleInput")}
            multiline
            code
            large
            onChange={(value) => onChange({ exampleInput: value })}
            onBlur={() => touch("exampleInput")}
          />
          <Field
            id="expected-output"
            label="Expected output"
            value={draft.expectedOutput}
            error={visibleError("expectedOutput")}
            multiline
            code
            large
            onChange={(value) => onChange({ expectedOutput: value })}
            onBlur={() => touch("expectedOutput")}
          />
          <Field
            id="starter-code"
            label="Public example solution"
            value={draft.starterCode}
            error={visibleError("starterCode")}
            multiline
            code
            large
            onChange={(value) => onChange({ starterCode: value })}
            onBlur={() => touch("starterCode")}
          />
        </section>

        <section className="grader-pane grader-pane--sealed" aria-labelledby="sealed-grader-label">
          <p className="pane-tag" id="sealed-grader-label">
            <Lock size={13} aria-hidden="true" />
            Sealed — private grader
          </p>
          <aside className="grader-contract">
            <span>Expected grader interface</span>
            <pre>{GRADER_INTERFACE}</pre>
            <p>
              <code>run_candidate(input)</code> executes the submitted solution.
            </p>
          </aside>

          <div className="source-tabs" role="tablist" aria-label="Private grader input method">
            <button
              type="button"
              className={draft.graderMode === "paste" ? "picked" : ""}
              onClick={() => onChange({ graderMode: "paste" })}
            >
              Paste code
            </button>
            <button
              type="button"
              className={draft.graderMode === "upload" ? "picked" : ""}
              onClick={() => {
                onChange({ graderMode: "upload" });
                fileRef.current?.click();
              }}
            >
              <UploadCloud size={14} aria-hidden="true" />
              Upload file
            </button>
          </div>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept=".ts,.js,.py"
            onChange={onUpload}
          />

          <Field
            id="grader-source"
            label={draft.graderMode === "upload" ? draft.graderFilename : "Grader code"}
            hint={`${new TextEncoder().encode(draft.graderSource).byteLength.toLocaleString()} bytes`}
            value={draft.graderSource}
            error={visibleError("graderSource")}
            multiline
            code
            large
            inverse
            onChange={(value) => onChange({ graderSource: value })}
            onBlur={() => touch("graderSource")}
          />

          <div className="score-fields score-fields--private">
            <Field
              id="passing-score"
              label="Passing score"
              value={draft.passingScore}
              error={visibleError("passingScore")}
              inputMode="decimal"
              inverse
              onChange={(value) => onChange({ passingScore: value })}
              onBlur={() => touch("passingScore")}
            />
            <SelectField
              id="score-direction"
              label="Score direction"
              value={draft.scoreDirection}
              options={[["higher", "Higher is better"]]}
              inverse
              onChange={(value) => onChange({ scoreDirection: value as ScoreDirection })}
            />
          </div>

          <details className="advanced-settings advanced-settings--inverse">
            <summary>Advanced settings</summary>
            <div className="derived-settings">
              <span>Grader file <strong>{draft.graderFilename}</strong></span>
              <span>Runtime <strong>{draft.graderRuntime}</strong></span>
              <span>Entrypoint <strong>{draft.graderEntrypoint}</strong></span>
            </div>
            <div className="score-fields score-fields--advanced">
              <Field
                id="score-name"
                label="Score name"
                value={draft.scoreName}
                error={visibleError("scoreName")}
                inverse
                onChange={(value) => onChange({ scoreName: value })}
                onBlur={() => touch("scoreName")}
              />
              <Field
                id="score-unit"
                label="Unit"
                value={draft.scoreUnit}
                error={visibleError("scoreUnit")}
                inverse
                onChange={(value) => onChange({ scoreUnit: value })}
                onBlur={() => touch("scoreUnit")}
              />
              <Field
                id="min-score"
                label="Minimum"
                value={draft.minScore}
                inverse
                onChange={(value) => onChange({ minScore: value })}
              />
              <Field
                id="max-score"
                label="Maximum"
                value={draft.maxScore}
                inverse
                onChange={(value) => onChange({ maxScore: value })}
              />
              <Field
                id="score-scale"
                label="Decimal scale"
                hint="1, 10, 100…"
                value={draft.scoreScale}
                error={visibleError("scoreScale")}
                inverse
                onChange={(value) => onChange({ scoreScale: value })}
                onBlur={() => touch("scoreScale")}
              />
            </div>
          </details>

          <div className="grader-validation" aria-live="polite">
            {!companyAuthEnabled && (
              <p className="validation-result validation-result--error">
                Privy company authentication is not configured. Real validation is unavailable.
              </p>
            )}
            {validationError && (
              <p className="validation-result validation-result--error" role="alert">
                {validationError}
              </p>
            )}
            {preflight && isCurrentValidation && (
              <div className="validation-result validation-result--success">
                <CheckCircle2 size={17} aria-hidden="true" />
                <div>
                  <strong>Grader validated in the sandbox</strong>
                  <span>
                    Entrypoint {preflight.entrypoint} returned score{" "}
                    {preflight.validationResult.score}
                    {preflight.validationResult.passed === undefined
                      ? ""
                      : preflight.validationResult.passed
                        ? " and passed."
                        : " and did not pass."}
                  </span>
                </div>
              </div>
            )}
            {preflight && !isCurrentValidation && (
              <p className="validation-result validation-result--stale">
                The grader changed after validation. Validate it again before publishing.
              </p>
            )}
            {!preflight && !validationError && !isCurrentValidation && (
              <p className="validation-result validation-result--stale">
                You can continue now and validate this grader before publishing.
              </p>
            )}
            {!isAuthenticated ? (
              <button type="button" className="button sealed-button" onClick={onLogin}>
                Sign in to validate grader
              </button>
            ) : (
              <button
                type="button"
                className="button sealed-button"
                disabled={isValidating || !companyAuthEnabled}
                onClick={onValidate}
              >
                {isValidating ? (
                  <LoaderCircle className="spin-icon" size={15} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={15} aria-hidden="true" />
                )}
                {isValidating ? "Validating in E2B…" : "Validate grader"}
              </button>
            )}
          </div>
          <p className="pane-note">
            Validation compiles and runs this exact source through the existing private E2B
            preflight. Editing any contract or score input invalidates the result.
          </p>
        </section>
      </div>
    </section>
  );
}

interface FundingStepProps extends CommonStepProps {
  wallet: string;
  walletBalance?: string;
  isAuthenticated: boolean;
  status?: string;
  onConnectWallet: () => void;
  onLogin: () => void;
}

function FundingStep({
  draft,
  wallet,
  walletBalance,
  visibleError,
  touch,
  isAuthenticated,
  status,
  onChange,
  onConnectWallet,
  onLogin,
}: FundingStepProps) {
  return (
    <section className="wizard-step" aria-labelledby="funding-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 3 of 4 — Funding</span>
        <h1 id="funding-heading">Set the reward and connect escrow.</h1>
        <p className="wizard-why">
          Privy authenticates the company and retains the connected wallet that funds the immutable
          reward on Monad Testnet.
        </p>
      </div>
      <div className="wizard-card fund-card">
        {!companyAuthEnabled && (
          <p className="auth-warning" role="alert">
            Privy company authentication is not configured. Publishing is disabled.
          </p>
        )}
        {!isAuthenticated && companyAuthEnabled && (
          <button type="button" className="button ghost full" onClick={onLogin}>
            Sign in as a company
          </button>
        )}
        <button type="button" className="button ghost full wallet-button" onClick={onConnectWallet}>
          {wallet ? (
            <>
              <CheckCircle2 size={16} aria-hidden="true" />
              Funding wallet {wallet.slice(0, 6)}…{wallet.slice(-4)}
            </>
          ) : (
            "Connect and verify funding wallet"
          )}
        </button>
        {visibleError("wallet") && <FieldError message={visibleError("wallet")} />}
        <p className="muted">Network: Monad Testnet (chain 10143) · Balance: {walletBalance ?? "Connect wallet"}</p>
        <Field
          id="reward"
          label="Reward amount"
          hint="MON locked in the challenge escrow."
          value={draft.reward}
          error={visibleError("reward")}
          inputMode="decimal"
          onChange={(value) => onChange({ reward: value })}
          onBlur={() => touch("reward")}
        />
        <Field
          id="deadline"
          label="Deadline"
          value={draft.deadline}
          error={visibleError("deadline")}
          type="date"
          min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          onChange={(value) => onChange({ deadline: value })}
          onBlur={() => touch("deadline")}
        />
        <Field
          id="max-submissions"
          label="Maximum submissions"
          hint="Total submission capacity for the challenge."
          value={draft.maxSubmissions}
          error={visibleError("maxSubmissions")}
          type="number"
          min="1"
          inputMode="numeric"
          onChange={(value) => onChange({ maxSubmissions: value })}
          onBlur={() => touch("maxSubmissions")}
        />
        {status && <p className="status-line">{status}</p>}
        <p className="escrow-note">
          <Lock size={13} aria-hidden="true" />
          Your connected Privy wallet separately approves the escrow funding transaction.
        </p>
      </div>
    </section>
  );
}

interface ConfirmStepProps {
  draft: ChallengeDraft;
  wallet: string;
  preflight?: PreflightResult;
  isCurrentValidation: boolean;
  error?: string;
  status?: string;
  isPublishing: boolean;
  onChange: (patch: Partial<ChallengeDraft>) => void;
  onEdit: (step: WizardStep) => void;
  onPublish: () => void;
}

function ConfirmStep({
  draft,
  wallet,
  preflight,
  isCurrentValidation,
  error,
  status,
  isPublishing,
  onChange,
  onEdit,
  onPublish,
}: ConfirmStepProps) {
  return (
    <section className="wizard-step" aria-labelledby="confirm-heading">
      <div className="wizard-head">
        <span className="eyebrow">Step 4 of 4 — Confirm</span>
        <h1 id="confirm-heading">Review what becomes public.</h1>
        <p className="wizard-why">
          The solver contract is published. The private grader source remains sealed and is
          represented publicly only by its commitment. Sandbox validation is optional here.
        </p>
      </div>
      <div className="confirm-grid">
        <div className="fund-summary">
          <Summary title="The problem" step={1} onEdit={onEdit}>
            <SummaryRow label="Title" value={draft.title} />
            <SummaryRow label="Success" value={draft.successCriteria} />
          </Summary>
          <Summary title="Public solver contract" step={2} onEdit={onEdit}>
            <SummaryRow
              label="Runtime"
              value={`${draft.solverLanguage} · ${draft.solverRuntime}`}
              mono
            />
            <SummaryRow
              label="Delivery"
              value={`${draft.solverEntrypoint} → ${draft.functionName}`}
              mono
            />
            <SummaryRow label="Signature" value={draft.functionSignature} mono />
            <SummaryRow
              label="Score"
              value={`${draft.scoreName} · ${draft.scoreDirection} is better · pass ${draft.passingScore} ${draft.scoreUnit}`}
            />
          </Summary>
          <Summary title="Sealed grader" step={2} onEdit={onEdit}>
            <SummaryRow
              label="Source"
              value={`${draft.graderFilename} · ${draft.graderLanguage} ${draft.graderRuntime}`}
              mono
            />
            <div className="summary-row">
              <dt>Validation</dt>
              <dd className="summary-verified">
                {isCurrentValidation && <CheckCircle2 size={14} aria-hidden="true" />}
                {isCurrentValidation
                  ? `Validated · score ${preflight?.validationResult.score ?? "—"}`
                  : "Not run · grading will validate it"}
              </dd>
            </div>
          </Summary>
        </div>
        <aside className="wizard-card publish-card">
          <span className="eyebrow">Escrow transaction</span>
          <strong className="publish-amount">{draft.reward} MON</strong>
          <dl className="publish-facts">
            <div>
              <dt>Deadline</dt>
              <dd>{draft.deadline}</dd>
            </div>
            <div>
              <dt>Funding wallet</dt>
              <dd>{wallet.slice(0, 6)}…{wallet.slice(-4)}</dd>
            </div>
            <div>
              <dt>Submission capacity</dt>
              <dd>{draft.maxSubmissions}</dd>
            </div>
          </dl>
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={draft.documentationConfirmed}
              onChange={(event) => onChange({ documentationConfirmed: event.target.checked })}
            />
            <span>
              I confirm the public contract and examples are accurate, and that the sealed source
              is the grader I intend to use.
            </span>
          </label>
          {error && <FieldError message={error} />}
          {!isCurrentValidation && (
            <p className="status-line">
              Validation was skipped. The grader will be validated when a submission is evaluated.
            </p>
          )}
          {status && <p className="status-line">{status}</p>}
          <button
            type="button"
            className="button primary full publish-button"
            disabled={!draft.documentationConfirmed || isPublishing}
            onClick={onPublish}
          >
            {isPublishing ? (
              <LoaderCircle className="spin-icon" size={15} aria-hidden="true" />
            ) : (
              <Lock size={15} aria-hidden="true" />
            )}
            {isPublishing ? "Publishing…" : "Fund & publish"}
          </button>
        </aside>
      </div>
    </section>
  );
}

function WizardProgress({
  current,
  draft,
  wallet,
  onSelect,
}: {
  current: WizardStep;
  draft: ChallengeDraft;
  wallet: string;
  onSelect: (step: WizardStep) => void;
}) {
  function complete(step: WizardStep) {
    if (step === 1) return Object.keys(problemErrors(draft)).length === 0;
    if (step === 2) return Object.keys(graderErrors(draft)).length === 0;
    if (step === 3) return Object.keys(fundingErrors(draft, wallet)).length === 0;
    return draft.documentationConfirmed;
  }

  function reachable(step: WizardStep) {
    if (step <= current) return true;
    return STEPS.filter((item) => item.id < step).every((item) => complete(item.id));
  }

  return (
    <ol className="post-stepper" aria-label={`Step ${current} of ${STEPS.length}`}>
      {STEPS.map(({ id, label }) => {
        const done = id < current && complete(id);
        const active = id === current;
        return (
          <li
            key={id}
            className="post-stepper__step"
            data-state={active ? "active" : done ? "done" : "todo"}
          >
            <button
              type="button"
              disabled={active || !reachable(id)}
              aria-current={active ? "step" : undefined}
              onClick={() => onSelect(id)}
            >
              <i aria-hidden="true">{done ? <Check size={12} strokeWidth={3} /> : id}</i>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  error,
  multiline = false,
  large = false,
  code = false,
  inverse = false,
  readOnly = false,
  type = "text",
  min,
  inputMode,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  multiline?: boolean;
  large?: boolean;
  code?: boolean;
  inverse?: boolean;
  readOnly?: boolean;
  type?: string;
  min?: string;
  inputMode?: "text" | "decimal" | "numeric";
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const className = [
    large ? "large" : "",
    code ? "code-editor" : "",
    inverse ? "inverse-input" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <label className="wizard-field" htmlFor={id}>
      <span className="wizard-field__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {multiline ? (
        <textarea
          id={id}
          className={className}
          value={value}
          readOnly={readOnly}
          spellCheck={!code}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      ) : (
        <input
          id={id}
          className={className}
          type={type}
          min={min}
          inputMode={inputMode}
          value={value}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      )}
      {error && <FieldError message={error} />}
    </label>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  inverse = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  inverse?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="wizard-field" htmlFor={id}>
      <span className="wizard-field__label">{label}</span>
      <select
        id={id}
        className={inverse ? "inverse-input" : ""}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span className="field-error" role="alert">
      {message}
    </span>
  );
}

function Summary({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: WizardStep;
  onEdit: (step: WizardStep) => void;
  children: React.ReactNode;
}) {
  return (
    <article className="summary-block">
      <div className="summary-block__head">
        <h2>{title}</h2>
        <button type="button" className="edit-link" onClick={() => onEdit(step)}>
          Edit
        </button>
      </div>
      <dl>{children}</dl>
    </article>
  );
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd data-mono={mono || undefined}>{value || "—"}</dd>
    </div>
  );
}
