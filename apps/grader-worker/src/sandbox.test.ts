import assert from "node:assert/strict";
import test from "node:test";
import { runGrader } from "./sandbox";
import { validateTrustedExecution } from "./execution-validation";

test("validates authenticated function-call counts, order, and schemas", () => {
  const trace = [
    { name: "fetch", arguments: { id: 1 }, output: { ok: true }, sequence: 0, occurredAt: "2030-01-01T00:00:00.000Z", runtimeId: "run-1" },
    { name: "save", arguments: { id: 1 }, output: { ok: true }, sequence: 1, occurredAt: "2030-01-01T00:00:01.000Z", runtimeId: "run-1" },
  ];
  const requirements = [
    { name: "fetch", argumentsSchema: { type: "object", required: ["id"] }, outputSchema: { type: "object" }, required: true, order: { before: ["save"] } },
  ];
  assert.equal(validateTrustedExecution({}, trace, requirements, { type: "object" }), undefined);
  assert.equal(validateTrustedExecution({}, trace.slice(1), requirements, {}), "SUBMISSION_INVALID");
});

test("runs graders only against real E2B when provider credentials are present", async (t) => {
  if (!process.env.E2B_API_KEY || !process.env.E2B_TEMPLATE_TS) {
    t.skip("real E2B credentials are required");
    return;
  }
  const input = {
    submittedCode: { source: "export default 4", language: "typescript" },
    agentFinalOutput: { score: 4 }, trustedFunctionCallTrace: [], producedArtifacts: [],
    challengeRequirements: { requiredFunctions: [], submissionSchema: {} },
    scoreSchema: { passingScore: "1", scoreScale: 1 },
    executionMetadata: { submissionId: "s", challengeId: "c", submissionHash: `0x${"0".repeat(64)}`, receivedAt: "2030-01-01T00:00:00.000Z", runtime: "test" },
  };
  const result = await runGrader("typescript", "export default async function grade(input: any) { return { score: String(input.agentFinalOutput.score), feedback: 'ok', metadata: {} }; }", input);
  assert.equal(result.ok, true);
});
