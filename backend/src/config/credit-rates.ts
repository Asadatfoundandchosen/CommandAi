/** Runtime consumption kinds billed against the rate card. */
export type ConsumptionResourceType = "signal" | "action" | "hitl";

/** Rate card keys shown in the org admin dashboard. */
export type CreditRateKey =
  | "signal_processed"
  | "action_executed"
  | "hitl_decision"
  | "data_sync_gb"
  | "report_generated";

export type CreditRateCard = Record<CreditRateKey, number>;

/** Platform default credits per billable unit. */
export const DEFAULT_RATES: CreditRateCard = {
  signal_processed: 1,
  action_executed: 5,
  hitl_decision: 2,
  data_sync_gb: 10,
  report_generated: 3,
};

/** Human-readable labels for the rate card UI. */
export const CREDIT_RATE_LABELS: Record<CreditRateKey, string> = {
  signal_processed: "Signal processed",
  action_executed: "Action executed",
  hitl_decision: "HITL decision",
  data_sync_gb: "Data sync (per GB)",
  report_generated: "Report generated",
};

/** Maps runtime consumption kinds to rate card keys. */
export const CONSUMPTION_TO_RATE_KEY: Record<ConsumptionResourceType, CreditRateKey> = {
  signal: "signal_processed",
  action: "action_executed",
  hitl: "hitl_decision",
};

export const ORG_SETTINGS_CREDIT_RATES_KEY = "credit_rates";

/** Merge enterprise overrides onto defaults (invalid keys ignored). */
export function mergeCreditRates(
  base: CreditRateCard,
  overrides?: Partial<CreditRateCard> | null,
): CreditRateCard {
  if (!overrides) {
    return { ...base };
  }
  const merged = { ...base };
  for (const key of Object.keys(DEFAULT_RATES) as CreditRateKey[]) {
    const value = overrides[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      merged[key] = Math.round(value);
    }
  }
  return merged;
}

export function consumptionCreditsForType(
  rates: CreditRateCard,
  type: ConsumptionResourceType,
): number {
  const key = CONSUMPTION_TO_RATE_KEY[type];
  return rates[key];
}

export function isCustomRateCard(
  rates: CreditRateCard,
  defaults: CreditRateCard = DEFAULT_RATES,
): boolean {
  return (Object.keys(defaults) as CreditRateKey[]).some((k) => rates[k] !== defaults[k]);
}

/** Load org-specific rates (defaults merged with `org_settings.credit_rates`). */
export async function getRatesForOrg(orgId: string): Promise<{
  rates: CreditRateCard;
  source: "default" | "custom";
}> {
  const { OrgSettingsModel } = await import(
    "../modules/organization/org-settings.model.js"
  );
  const mongoose = await import("mongoose");
  const custom = await OrgSettingsModel.findOne({
    org_id: new mongoose.Types.ObjectId(orgId),
    key: ORG_SETTINGS_CREDIT_RATES_KEY,
  }).lean();

  const overrides =
    custom?.value && typeof custom.value === "object"
      ? (custom.value as Partial<CreditRateCard>)
      : null;
  const rates = mergeCreditRates(DEFAULT_RATES, overrides);
  return {
    rates,
    source: isCustomRateCard(rates) ? "custom" : "default",
  };
}
