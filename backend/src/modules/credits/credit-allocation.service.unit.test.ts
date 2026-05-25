import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors allocation cap check in CreditAllocationService. */
function wouldExceedCreditLimit(
  currentAllocated: number,
  amount: number,
  creditLimit: number,
): boolean {
  return creditLimit > 0 && currentAllocated + amount > creditLimit;
}

describe("account credit allocation limits", () => {
  it("allows allocation when credit_limit is zero (no cap)", () => {
    assert.equal(wouldExceedCreditLimit(50_000, 10_000, 0), false);
  });

  it("rejects when allocated would exceed credit_limit", () => {
    assert.equal(wouldExceedCreditLimit(900, 200, 1000), true);
  });

  it("allows allocation up to credit_limit", () => {
    assert.equal(wouldExceedCreditLimit(800, 200, 1000), false);
  });
});
