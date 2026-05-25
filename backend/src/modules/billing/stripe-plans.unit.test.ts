import assert from "node:assert/strict";
import { test } from "node:test";

import { STRIPE_PLAN_KEYS, getPlanDefinition, isStripePlanKey } from "./stripe-plans.js";

test("catalog includes all required plan keys", () => {
  assert.equal(STRIPE_PLAN_KEYS.length, 5);
  assert.ok(isStripePlanKey("enterprise_annual"));
  assert.equal(getPlanDefinition("pro_monthly").credit_allocation, 10_000);
});

test("isStripePlanKey rejects unknown keys", () => {
  assert.equal(isStripePlanKey("invalid"), false);
});
