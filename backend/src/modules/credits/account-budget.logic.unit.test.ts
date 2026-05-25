import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetPercentUsed,
  isBudgetWarningActive,
} from "./account-budget.logic.js";

describe("account budget logic", () => {
  it("computes percent used from allocated and used", () => {
    assert.equal(budgetPercentUsed(1000, 250), 25);
    assert.equal(budgetPercentUsed(0, 100), 0);
  });

  it("flags warning when usage meets threshold", () => {
    assert.equal(isBudgetWarningActive(1000, 800, 80), true);
    assert.equal(isBudgetWarningActive(1000, 799, 80), false);
  });
});
