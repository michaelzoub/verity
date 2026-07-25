import assert from "node:assert/strict";
import test from "node:test";
import { commitment, parseScaledScore } from "./crypto";

test("supports challenge-defined 0-4, 0-400, and decimal score scales", () => {
  assert.equal(parseScaledScore("4", 1), 4n);
  assert.equal(parseScaledScore("400", 1), 400n);
  assert.equal(parseScaledScore("3.75", 100), 375n);
});

test("rejects invalid scales, unrepresentable decimals, and uint256 overflow", () => {
  assert.throws(() => parseScaledScore("1", 12), /invalid_score_scale|score_not_representable_at_scale/);
  assert.throws(() => parseScaledScore("3.141", 100), /score_not_representable_at_scale/);
  assert.throws(() => parseScaledScore("1".repeat(79), 1), /score_overflow/);
});

test("grader commitments canonicalize source but bind every execution setting", () => {
  const stable = commitment("export default () => 4;\r\n", "typescript", "22", "default", { b: 2, a: 1 });
  assert.equal(stable, commitment("export default () => 4;\n", "typescript", "22", "default", { a: 1, b: 2 }));
  assert.notEqual(stable, commitment("export default () => 4;\n", "typescript", "20", "default", { a: 1, b: 2 }));
});
