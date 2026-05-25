import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_ALERT_THRESHOLDS } from "./credit-alert.constants.js";
import { resolveMostSevereThreshold } from "./credit-alert.logic.js";

describe("resolveMostSevereThreshold", () => {
  it("returns warning at 25% remaining", () => {
    const matched = resolveMostSevereThreshold(25, DEFAULT_ALERT_THRESHOLDS);
    assert.equal(matched?.level, "warning");
    assert.equal(matched?.percent, 25);
  });

  it("returns critical at 10% remaining", () => {
    const matched = resolveMostSevereThreshold(10, DEFAULT_ALERT_THRESHOLDS);
    assert.equal(matched?.level, "critical");
    assert.equal(matched?.percent, 10);
  });

  it("returns urgent at 5% remaining", () => {
    const matched = resolveMostSevereThreshold(5, DEFAULT_ALERT_THRESHOLDS);
    assert.equal(matched?.level, "urgent");
    assert.equal(matched?.percent, 5);
  });

  it("returns undefined above all thresholds", () => {
    const matched = resolveMostSevereThreshold(26, DEFAULT_ALERT_THRESHOLDS);
    assert.equal(matched, undefined);
  });

  it("picks lowest crossed threshold when multiple apply", () => {
    const matched = resolveMostSevereThreshold(4, DEFAULT_ALERT_THRESHOLDS);
    assert.equal(matched?.level, "urgent");
  });
});
