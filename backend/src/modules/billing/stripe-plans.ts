import type { BillingCycle, BillingPlan } from "../contract/contract.model.js";

/** Stripe catalog keys synced with contract billing plans. */
export type StripePlanKey =
  | "starter_monthly"
  | "starter_annual"
  | "pro_monthly"
  | "pro_annual"
  | "enterprise_annual";

export const STRIPE_PLAN_KEYS: readonly StripePlanKey[] = [
  "starter_monthly",
  "starter_annual",
  "pro_monthly",
  "pro_annual",
  "enterprise_annual",
] as const;

export type StripePlanDefinition = {
  key: StripePlanKey;
  plan: BillingPlan;
  billing_cycle: BillingCycle;
  /** Credits allocated on successful `invoice.paid`. */
  credit_allocation: number;
  /** Display name in Stripe Dashboard. */
  product_name: string;
  /** USD cents per billing period (Stripe `unit_amount`). */
  unit_amount_cents: number;
  /** `month` | `year` for recurring prices. */
  recurring_interval: "month" | "year";
  recurring_interval_count: number;
};

export const STRIPE_PLAN_CATALOG: Record<StripePlanKey, StripePlanDefinition> = {
  starter_monthly: {
    key: "starter_monthly",
    plan: "starter",
    billing_cycle: "monthly",
    credit_allocation: 1_000,
    // aligned with config/plans.ts starter monthly_credits
    product_name: "1CommandAI Starter (Monthly)",
    unit_amount_cents: 9_900,
    recurring_interval: "month",
    recurring_interval_count: 1,
  },
  starter_annual: {
    key: "starter_annual",
    plan: "starter",
    billing_cycle: "annual",
    credit_allocation: 12_000,
    product_name: "1CommandAI Starter (Annual)",
    unit_amount_cents: 99_900,
    recurring_interval: "year",
    recurring_interval_count: 1,
  },
  pro_monthly: {
    key: "pro_monthly",
    plan: "pro",
    billing_cycle: "monthly",
    credit_allocation: 10_000,
    product_name: "1CommandAI Pro (Monthly)",
    unit_amount_cents: 49_900,
    recurring_interval: "month",
    recurring_interval_count: 1,
  },
  pro_annual: {
    key: "pro_annual",
    plan: "pro",
    billing_cycle: "annual",
    credit_allocation: 120_000,
    product_name: "1CommandAI Pro (Annual)",
    unit_amount_cents: 499_900,
    recurring_interval: "year",
    recurring_interval_count: 1,
  },
  enterprise_annual: {
    key: "enterprise_annual",
    plan: "enterprise",
    billing_cycle: "annual",
    credit_allocation: 100_000,
    product_name: "1CommandAI Enterprise (Annual)",
    unit_amount_cents: 999_900,
    recurring_interval: "year",
    recurring_interval_count: 1,
  },
};

export function isStripePlanKey(value: string): value is StripePlanKey {
  return (STRIPE_PLAN_KEYS as readonly string[]).includes(value);
}

export function getPlanDefinition(planKey: StripePlanKey): StripePlanDefinition {
  return STRIPE_PLAN_CATALOG[planKey];
}

/** Resolve plan from a Stripe Price id (env overrides + org-stored map). */
export function resolvePlanKeyFromPriceId(
  priceId: string,
  priceIdMap: Partial<Record<StripePlanKey, string>>,
): StripePlanKey | null {
  for (const key of STRIPE_PLAN_KEYS) {
    if (priceIdMap[key] === priceId) {
      return key;
    }
  }
  return null;
}
