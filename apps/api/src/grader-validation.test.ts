import assert from "node:assert/strict";
import test from "node:test";
import { hasSupportedGraderEntrypoint } from "./grader-validation";

test("accepts the wizard's Python grader entrypoint", () => {
  assert.equal(
    hasSupportedGraderEntrypoint("python", "def grade(run_candidate):\n    return {}"),
    true,
  );
});

test("accepts the wizard's TypeScript grader entrypoint", () => {
  assert.equal(
    hasSupportedGraderEntrypoint(
      "typescript",
      "export default async function grade(runCandidate: any) { return {}; }",
    ),
    true,
  );
});

test("rejects graders without the fixed entrypoint", () => {
  assert.equal(hasSupportedGraderEntrypoint("python", "def score(value):\n    return {}"), false);
  assert.equal(
    hasSupportedGraderEntrypoint("javascript", "export function grade(value) { return {}; }"),
    false,
  );
});
