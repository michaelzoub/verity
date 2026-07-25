import assert from "node:assert/strict";
import test from "node:test";
import { agentSubmissionSchema, createChallengeSchema, submitSolutionSchema } from "./index";

const publicSpec = (language: "typescript" | "python" = "typescript") => ({ problemDescription: "Return the supplied number.", successCriteria: "Output equals input.", language, runtimeVersion: language === "python" ? "3.12" : "22", entrypoint: language === "python" ? "solution.py" : "solution.ts", requiredFunctions: [{ name: "solve", inputSchema: { type: "object" }, outputSchema: { type: "object" } }], submissionFormat: "One source file.", allowedDependencies: [], scoring: { passingScore: "4", scoreScale: 1 }, examples: [{ functionName: "solve", input: { value: 1 }, output: { value: 1 } }], documentationConfirmed: true as const });
const base = { title: "Score schema", description: "A sufficiently long private grader challenge.", tags: ["test"], agentContext: "Return JSON.", rewardWei: "1", fundingWallet: "0x1111111111111111111111111111111111111111", maxSubmissions: 1, deadline: "2030-01-01T00:00:00.000Z", runtimeVersion: "22", entrypoint: "default", graderSource: "export default async function grade(input) { return input.score; }", chainId: 10143, publicSpec: publicSpec() };

test("defaults omitted scoreScale to exact integer scale one", () => {
  const parsed = createChallengeSchema.parse({ ...base, language: "typescript", scoring: { passingScore: "4", minScore: "0", maxScore: "4" } });
  assert.equal(parsed.scoring.scoreScale, 1);
});

test("accepts fixed language entrypoints and rejects unsupported graders", () => {
  for (const language of ["typescript", "javascript", "python"] as const) assert.equal(createChallengeSchema.parse({ ...base, language, runtimeVersion: language === "python" ? "3.12" : "22", entrypoint: language === "python" ? "grade" : "default", scoring: { passingScore: "400", scoreScale: 1 }, publicSpec: { ...publicSpec(language === "python" ? "python" : "typescript"), language, entrypoint: language === "python" ? "solution.py" : language === "javascript" ? "solution.js" : "solution.ts", scoring: { passingScore: "400", scoreScale: 1 } } as any }).language, language);
  assert.throws(() => createChallengeSchema.parse({ ...base, language: "ruby", scoring: { passingScore: "4" } }), /Invalid enum value/);
});

test("requires a filename for uploaded source", () => {
  assert.throws(() => createChallengeSchema.parse({ ...base, language: "python", graderSource: undefined, graderSourceBase64: "ZGVmIGdyYWRlcih4KTogcmV0dXJuIDQ=", scoring: { passingScore: "4" } }), /graderFileName/);
});

test("accepts complete TypeScript and Python public specifications", () => {
  assert.equal(createChallengeSchema.parse({ ...base, language: "typescript", scoring: { passingScore: "4", scoreScale: 1 } }).publicSpec.entrypoint, "solution.ts");
  assert.equal(createChallengeSchema.parse({ ...base, language: "python", runtimeVersion: "3.12", entrypoint: "grade", graderSource: "def grade(input): return {'score': '4', 'feedback': 'ok', 'metadata': {}}", scoring: { passingScore: "4", scoreScale: 1 }, publicSpec: publicSpec("python") }).publicSpec.language, "python");
});

test("rejects incomplete public entrypoint and function schemas", () => {
  assert.throws(() => createChallengeSchema.parse({ ...base, language: "typescript", scoring: { passingScore: "4", scoreScale: 1 }, publicSpec: { ...publicSpec(), entrypoint: "solution.py" } }), /entrypoint extension/);
  assert.throws(() => createChallengeSchema.parse({ ...base, language: "typescript", scoring: { passingScore: "4", scoreScale: 1 }, publicSpec: { ...publicSpec(), requiredFunctions: [{ name: "solve", inputSchema: {}, outputSchema: { type: "object" } }] } }), /JSON Schema requires/);
});

test("requires real, safe, unique source files and a wallet signature", () => {
  const payload = {
    sourceFiles: [{ path: "solution.ts", content: "export const solve = () => 1;" }],
    language: "typescript" as const,
    finalOutput: {},
    artifacts: [],
  };
  assert.equal(agentSubmissionSchema.parse(payload).sourceFiles[0].path, "solution.ts");
  for (const sourceFiles of [[], [{ path: "../secret.ts", content: "x" }], [{ path: "a.ts", content: "x" }, { path: "a.ts", content: "y" }]]) {
    assert.throws(() => agentSubmissionSchema.parse({ ...payload, sourceFiles }));
  }
  const nonce = "00000000-0000-4000-8000-000000000000";
  assert.throws(() => submitSolutionSchema.parse({ payload, nonce }), /signature/i);
  assert.throws(() => submitSolutionSchema.parse({ payload, nonce, signature: "0x1234" }), /Invalid/);
});
