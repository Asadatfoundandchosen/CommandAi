/** USD per credit for one-off org credit packs (PaymentIntent). */
export const CREDIT_PURCHASE_PRICE_USD = 0.01;

/** Minimum credits per purchase. */
export const CREDIT_PURCHASE_MIN_AMOUNT = 100;

/** Maximum credits per purchase. */
export const CREDIT_PURCHASE_MAX_AMOUNT = 1_000_000;

/** Stripe PaymentIntent metadata `purchase_type` value. */
export const CREDIT_PURCHASE_METADATA_TYPE = "credit_pack";

/** System actor for webhook-driven ledger entries. */
export const CREDIT_PURCHASE_SYSTEM_ACTOR = "000000000000000000000001";

/** Stable ledger description for idempotent webhook crediting. */
export function creditPurchaseDescription(paymentIntentId: string): string {
  return `Credit purchase (${paymentIntentId})`;
}

/** USD cents charged for a credit pack (integer cents). */
export function creditsToUsdCents(
  amountCredits: number,
  pricePerCreditUsd: number = CREDIT_PURCHASE_PRICE_USD,
): number {
  return Math.round(amountCredits * pricePerCreditUsd * 100);
}
