import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_RATES,
  consumptionCreditsForType,
  isCustomRateCard,
  mergeCreditRates,
} from "./credit-rates.js";

describe("credit rate configuration", () => {
  it("merges enterprise overrides onto defaults", () => {
    const merged = mergeCreditRates(DEFAULT_RATES, {
      action_executed: 3,
      invalid_key: 99,
    } as never);
    assert.equal(merged.action_executed, 3);
    assert.equal(merged.signal_processed, 1);
    assert.equal(merged.hitl_decision, 2);
  });

  it("detects custom rate cards", () => {
    assert.equal(isCustomRateCard(DEFAULT_RATES), false);
    assert.equal(
      isCustomRateCard(mergeCreditRates(DEFAULT_RATES, { hitl_decision: 1 })),
      true,
    );
  });

  it("maps consumption types to rate keys", () => {
    assert.equal(consumptionCreditsForType(DEFAULT_RATES, "action"), 5);
    assert.equal(consumptionCreditsForType(DEFAULT_RATES, "signal"), 1);
    assert.equal(consumptionCreditsForType(DEFAULT_RATES, "hitl"), 2);
  });
});
