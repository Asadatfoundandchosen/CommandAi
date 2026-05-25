import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONSUMPTION_RATES,
  consumptionRateFor,
  isConsumptionResourceType,
} from "./credit-consumption.constants.js";

describe("consumption rates", () => {
  it("charges 1 / 5 / 2 credits for signal / action / hitl", () => {
    assert.equal(CONSUMPTION_RATES.signal, 1);
    assert.equal(CONSUMPTION_RATES.action, 5);
    assert.equal(CONSUMPTION_RATES.hitl, 2);
    assert.equal(consumptionRateFor("signal"), 1);
    assert.equal(consumptionRateFor("action"), 5);
    assert.equal(consumptionRateFor("hitl"), 2);
  });

  it("rejects unknown resource types", () => {
    assert.equal(isConsumptionResourceType("signal"), true);
    assert.equal(isConsumptionResourceType("workflow"), false);
  });
});
