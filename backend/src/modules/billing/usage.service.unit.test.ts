import assert from "node:assert/strict";
import { test } from "node:test";

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

test("startOfUtcMonth is first day UTC", () => {
  const d = startOfUtcMonth(new Date("2026-05-21T15:00:00.000Z"));
  assert.equal(d.toISOString(), "2026-05-01T00:00:00.000Z");
});

test("remaining credits never negative", () => {
  const allocated = 1000;
  const used = 1200;
  const remaining = Math.max(allocated - used, 0);
  assert.equal(remaining, 0);
});
