import {
  CONSUMPTION_TO_RATE_KEY,
  DEFAULT_RATES,
  consumptionCreditsForType,
  type ConsumptionResourceType,
} from "../../config/credit-rates.js";
import type { CreditReferenceType } from "./credit.model.js";

export type { ConsumptionResourceType };

/** Default platform rates (per consumption kind). */
export const CONSUMPTION_RATES: Record<ConsumptionResourceType, number> = {
  signal: DEFAULT_RATES.signal_processed,
  action: DEFAULT_RATES.action_executed,
  hitl: DEFAULT_RATES.hitl_decision,
};

export function isConsumptionResourceType(
  value: string,
): value is ConsumptionResourceType {
  return value === "signal" || value === "action" || value === "hitl";
}

export function consumptionRateFor(type: ConsumptionResourceType): number {
  return consumptionCreditsForType(DEFAULT_RATES, type);
}

export { CONSUMPTION_TO_RATE_KEY };

/** Maps consumption kind to `CreditTransaction.reference_type`. */
export function referenceTypeForConsumption(
  type: ConsumptionResourceType,
): CreditReferenceType {
  return type;
}

/** Worker / system actor for async consumption ledger rows. */
export const CREDIT_CONSUMPTION_SYSTEM_ACTOR = "000000000000000000000001";
