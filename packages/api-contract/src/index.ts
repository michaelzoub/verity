import { z } from "zod";
const decimal = z.union([z.string().regex(/^(0|[1-9]\d*)(?:\.\d+)?$/), z.number().finite().nonnegative()]).transform(String);
export const scoreSchema = z.object({ passingScore: decimal, minScore: decimal.optional(), maxScore: decimal.optional(), scoreScale: z.number().int().positive().max(1_000_000_000).default(1), scoreUnit: z.string().min(1).max(64).optional() }).superRefine((v, ctx) => { if (!/^10*$/.test(String(v.scoreScale))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scoreScale must be a power of ten" }); });
export const graderLanguageSchema = z.enum(["typescript", "javascript", "python"]);
const jsonValue: z.ZodType<any> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(jsonValue)]));
export const requiredFunctionSchema = z.object({ name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/), argumentsSchema: z.record(z.unknown()).default({}), outputSchema: z.record(z.unknown()).default({}), required: z.boolean(), minCalls: z.number().int().nonnegative().optional(), maxCalls: z.number().int().positive().optional(), order: z.object({ after: z.array(z.string()).optional(), before: z.array(z.string()).optional() }).optional() }).superRefine((v, ctx) => { if (v.minCalls !== undefined && v.maxCalls !== undefined && v.minCalls > v.maxCalls) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "minCalls cannot exceed maxCalls" }); });
const jsonSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  if (value.type === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON Schema requires a type" });
});
export const publicFunctionSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  inputSchema: jsonSchema,
  outputSchema: jsonSchema,
}).strict();
export const publicExampleSchema = z.object({
  functionName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  input: jsonValue,
  output: jsonValue,
}).strict();
export const publicChallengeSpecSchema = z.object({
  problemDescription: z.string().min(10),
  successCriteria: z.string().min(3),
  language: graderLanguageSchema,
  runtimeVersion: z.string().min(1).max(80),
  entrypoint: z.string().regex(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:ts|js|py)$/),
  requiredFunctions: z.array(publicFunctionSchema).min(1),
  submissionFormat: z.string().min(3),
  allowedDependencies: z.array(z.string().min(1)).max(32),
  scoring: scoreSchema,
  examples: z.array(publicExampleSchema).min(1),
  starterCode: z.string().max(256 * 1024).optional(),
  documentationConfirmed: z.literal(true),
}).strict().superRefine((value, ctx) => {
  const names = new Set(value.requiredFunctions.map(item => item.name));
  for (const example of value.examples) if (!names.has(example.functionName)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "public example references an undeclared function" });
  const extension = value.entrypoint.split(".").pop();
  if ((value.language === "typescript" && extension !== "ts") || (value.language === "javascript" && extension !== "js") || (value.language === "python" && extension !== "py")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "entrypoint extension must match public specification language" });
});
export const graderResultSchema = z.object({ score: decimal, passed: z.boolean().optional(), feedback: z.string().max(16_000), metadata: z.record(jsonValue).default({}) }).strict();
const sourceFileSchema = z.object({
  path: z.string().min(1).max(240).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/),
  content: z.string().max(1_000_000),
}).strict();
const submittedCodeSchema = z.object({
  source: z.string().min(1).max(1_000_000),
  files: z.array(sourceFileSchema).min(1).max(128),
  language: graderLanguageSchema,
}).strict();
export const graderInputSchema = z.object({ submittedCode: submittedCodeSchema, agentFinalOutput: jsonValue, trustedFunctionCallTrace: z.array(z.object({ name: z.string(), arguments: jsonValue, output: jsonValue, sequence: z.number().int().nonnegative(), occurredAt: z.string().datetime(), runtimeId: z.string().min(1) }).strict()), producedArtifacts: z.array(z.object({ name: z.string().min(1), mediaType: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative(), content: jsonValue.optional() }).strict()), challengeRequirements: z.object({ requiredFunctions: z.array(requiredFunctionSchema), submissionSchema: z.record(z.unknown()).default({}) }).strict(), scoreSchema, executionMetadata: z.object({ submissionId: z.string().min(1), challengeId: z.string().min(1), submissionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), receivedAt: z.string().datetime(), runtime: z.string().min(1) }).strict() }).strict();
export const agentSubmissionSchema = z.object({
  sourceFiles: z.array(sourceFileSchema).min(1).max(128),
  language: graderLanguageSchema,
  finalOutput: jsonValue,
  artifacts: z.array(z.object({ name: z.string().min(1), mediaType: z.string().min(1), content: jsonValue.optional() }).strict()).default([]),
}).strict().superRefine((value, ctx) => {
  const paths = new Set<string>();
  let bytes = 0;
  for (const file of value.sourceFiles) {
    if (paths.has(file.path)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate source file path" });
    paths.add(file.path);
    bytes += new TextEncoder().encode(file.content).byteLength;
  }
  if (bytes > 1_000_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "source file bundle exceeds 1 MB" });
});
export const trustedFunctionCallSchema = graderInputSchema.shape.trustedFunctionCallTrace.element;
const graderDefinition = z.object({ language: graderLanguageSchema, runtimeVersion: z.string().min(1).max(80), entrypoint: z.string().optional(), graderSource: z.string().optional(), graderSourceBase64: z.string().optional(), graderFileName: z.string().min(1).optional(), graderConfig: z.record(z.unknown()).default({}), dependencies: z.array(z.string().min(1)).max(32).default([]) });
const validateGraderDefinition = <T extends z.AnyZodObject>(schema: T) => schema.superRefine((v: any, ctx) => { if (Boolean(v.graderSource) === Boolean(v.graderSourceBase64)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "provide exactly one pasted graderSource or graderSourceBase64" }); if (v.graderSourceBase64 && !v.graderFileName) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "uploaded grader source requires graderFileName" }); if (v.entrypoint && v.entrypoint !== (v.language === "python" ? "grade" : "default")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "unsupported_grader_entrypoint" }); });
export const graderPreflightSchema = validateGraderDefinition(graderDefinition.extend({ validationSample: agentSubmissionSchema.optional(), requiredFunctions: z.array(requiredFunctionSchema).default([]), submissionSchema: z.record(z.unknown()).default({}), scoring: scoreSchema }));
const createChallengeBase = z.object({ title: z.string().min(3), description: z.string().min(10), tags: z.array(z.string()).min(1), agentContext: z.string().min(1), rewardWei: z.string().regex(/^[1-9]\d*$/), fundingWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), maxSubmissions: z.number().int().positive(), deadline: z.string().datetime(), chainId: z.literal(10143), requiredFunctions: z.array(requiredFunctionSchema).default([]), submissionSchema: z.record(z.unknown()).default({}), validationSample: agentSubmissionSchema.optional(), scoring: scoreSchema, publicSpec: publicChallengeSpecSchema }).merge(graderDefinition);
export const createChallengeSchema = validateGraderDefinition(createChallengeBase).superRefine((value, ctx) => {
  if (value.publicSpec.language !== value.language || value.publicSpec.runtimeVersion !== value.runtimeVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "public specification runtime must match grader runtime" });
  if (value.publicSpec.scoring.passingScore !== value.scoring.passingScore || value.publicSpec.scoring.scoreScale !== value.scoring.scoreScale) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "public specification score schema must match challenge scoring" });
});
export const publicTestSubmissionSchema = z.object({ code: z.string().min(1).max(1_000_000), language: graderLanguageSchema }).strict();
export const walletNonceSchema = z.object({ challengeId: z.string().min(1) });
export const submitSolutionSchema = z.object({ payload: agentSubmissionSchema, nonce: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict();
export const platformSubmissionSchema = submitSolutionSchema.extend({ platformExecutionId: z.string().min(1).max(200), trustedFunctionCallTrace: z.array(trustedFunctionCallSchema) }).strict();
export const workerResultSchema = z.object({ jobId: z.string().uuid(), challengeId: z.string().uuid(), submissionId: z.string().uuid(), submissionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), agentWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/), graderCommitment: z.string().regex(/^0x[0-9a-fA-F]{64}$/), graderVersion: z.number().int().positive(), attempt: z.number().int().positive(), outcome: z.enum(["SCORED", "UNEVALUABLE", "GRADER_ERROR", "GRADING_TIMEOUT"]), score: decimal.optional(), graderResult: graderResultSchema.optional(), sandboxId: z.string().min(1).optional(), errorCode: z.enum(["GRADER_COMPILE_FAILURE", "GRADER_MISSING_ENTRYPOINT", "GRADER_INVALID_RESULT", "GRADER_TIMEOUT", "GRADER_SANDBOX_VIOLATION", "GRADER_SCORE_OUT_OF_RANGE", "SUBMISSION_INVALID", "GRADER_PREFLIGHT_FAILED"]).optional() }).strict().superRefine((v, ctx) => { if (v.outcome === "SCORED" && (v.score === undefined || !v.graderResult)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "scored result requires score and graderResult" }); if (v.outcome !== "SCORED" && (v.score !== undefined || v.graderResult !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "non-scored result cannot include result" }); if (v.outcome !== "UNEVALUABLE" && !v.sandboxId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "E2B outcomes require sandboxId" }); });
