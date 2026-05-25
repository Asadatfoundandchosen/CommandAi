import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CREDIT_PURCHASE_PRICE_USD,
  creditPurchaseDescription,
  creditsToUsdCents,
} from "./credit-purchase.constants.js";

describe("credit purchase pricing", () => {
  it("charges $0.01 per credit in USD cents", () => {
    assert.equal(creditsToUsdCents(1000), 1000);
    assert.equal(CREDIT_PURCHASE_PRICE_USD, 0.01);
  });

  it("builds stable ledger description for idempotency", () => {
    assert.equal(
      creditPurchaseDescription("pi_abc123"),
      "Credit purchase (pi_abc123)",
    );
  });
});
