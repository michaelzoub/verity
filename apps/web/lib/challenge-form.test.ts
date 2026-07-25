import assert from "node:assert/strict";
import test from "node:test";
import { languageFromFilename, scoreLabel, validateGraderSource } from "./challenge-form";

test("accepts pasted Python and TypeScript graders", () => {
  assert.equal(validateGraderSource("def grade(value):\n return 3.5", "python", "grade"), undefined);
  assert.equal(validateGraderSource("export default function grade() { return 3.5 }", "typescript", "default"), undefined);
});
test("uploads are based on source content and detect supported extensions", () => {
  assert.equal(languageFromFilename("grader.py"), "python");
  assert.equal(languageFromFilename("grader.ts"), "typescript");
  assert.equal(languageFromFilename("grader.txt"), undefined);
  assert.equal(validateGraderSource("", "typescript", "default"), "Paste code or upload a non-empty source file.");
});
test("validates entrypoint and supports decimal variable score displays", () => {
  assert.match(validateGraderSource("export const grade = () => 1", "typescript", "default") ?? "", /default/);
  assert.equal(scoreLabel("3.5", "4", "points"), "3.5 / 4 points");
  assert.equal(scoreLabel("320", "400", "credits"), "320 / 400 credits");
});
