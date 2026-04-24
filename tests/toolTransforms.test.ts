import test from "node:test";
import assert from "node:assert/strict";
import { classifyInsightType, isoWeek, linearSlope } from "../src/agent/toolTransforms.js";

test("isoWeek computes valid ISO week labels", () => {
  assert.match(isoWeek("2026-01-01"), /^202[56]-W\d{2}$/);
  assert.match(isoWeek("2025-12-31"), /^202[56]-W\d{2}$/);
});

test("linearSlope computes expected trend", () => {
  assert.ok(Math.abs(linearSlope([5, 4, 3, 2]) + 1) < 1e-9);
  assert.equal(linearSlope([2, 2, 2]), 0);
  assert.equal(linearSlope([1]), 0);
});

test("classifyInsightType maps response text to categories", () => {
  assert.equal(
    classifyInsightType("Your mileage and weekly km are trending up"),
    "Volume Review"
  );
  assert.equal(classifyInsightType("You look ready for a race PR"), "Race Readiness");
  assert.equal(classifyInsightType("No specific signal here"), "General");
});
