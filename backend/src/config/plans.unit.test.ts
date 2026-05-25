import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PLANS,
  creditsForBillingCycle,
  isUnlimitedLimit,
  stripePlanKeyForTier,
  tierFromStripePlanKey,
} from "./plans.js";

test("starter monthly credits and limits", () => {
  assert.equal(PLANS.starter.max_users, 5);
  assert.equal(creditsForBillingCycle("starter", "monthly"), 1000);
  assert.equal(creditsForBillingCycle("starter", "annual"), 12_000);
});

test("enterprise has unlimited account cap", () => {
  assert.ok(isUnlimitedLimit(PLANS.enterprise.max_accounts));
});

test("stripePlanKeyForTier maps starter monthly", () => {
  assert.equal(stripePlanKeyForTier("starter", "monthly"), "starter_monthly");
  assert.equal(stripePlanKeyForTier("enterprise", "monthly"), null);
});

test("tierFromStripePlanKey parses pro annual", () => {
  assert.equal(tierFromStripePlanKey("pro_annual"), "pro");
});
