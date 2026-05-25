import test from "node:test";
import assert from "node:assert/strict";

import { addBillingPeriod } from "./contract-renewal.dates.js";
import { daysUntilDate } from "./contract.dto.js";

test("addBillingPeriod extends monthly by one UTC month", () => {
  const start = new Date("2026-01-15T12:00:00.000Z");
  const end = addBillingPeriod(start, "monthly");
  assert.equal(end.toISOString(), "2026-02-15T12:00:00.000Z");
});

test("addBillingPeriod extends annual by one UTC year", () => {
  const start = new Date("2026-03-01T00:00:00.000Z");
  const end = addBillingPeriod(start, "annual");
  assert.equal(end.toISOString(), "2027-03-01T00:00:00.000Z");
});

test("daysUntilDate matches renewal reminder thresholds", () => {
  const end = new Date("2026-06-20T00:00:00.000Z");
  const now30 = new Date("2026-05-21T12:00:00.000Z");
  assert.equal(daysUntilDate(end, now30), 30);
  const now7 = new Date("2026-06-13T12:00:00.000Z");
  assert.equal(daysUntilDate(end, now7), 7);
  const now0 = new Date("2026-06-20T12:00:00.000Z");
  assert.equal(daysUntilDate(end, now0), 0);
});
