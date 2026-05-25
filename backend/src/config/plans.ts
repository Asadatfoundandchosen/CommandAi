/** Subscription tier keys (aligned with contract `billing.plan`). */
export type PlanTier = "starter" | "pro" | "enterprise";

export const PLAN_TIERS: readonly PlanTier[] = ["starter", "pro", "enterprise"] as const;

export type PlanDefinition = {
  name: string;
  monthly_credits: number;
  features: readonly string[];
  price_monthly: number | null;
  price_annual: number | null;
  max_accounts: number;
  max_users: number;
};

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    name: "Starter",
    monthly_credits: 1000,
    features: ["basic_agents", "email_support"],
    price_monthly: 99,
    price_annual: 999,
    max_accounts: 1,
    max_users: 5,
  },
  pro: {
    name: "Pro",
    monthly_credits: 10000,
    features: ["advanced_agents", "playbooks", "priority_support"],
    price_monthly: 499,
    price_annual: 4999,
    max_accounts: 5,
    max_users: 25,
  },
  enterprise: {
    name: "Enterprise",
    monthly_credits: 100000,
    features: ["all", "sso", "dedicated_support", "sla"],
    price_monthly: null,
    price_annual: null,
    max_accounts: -1,
    max_users: -1,
  },
};

export type BillingCycle = "monthly" | "annual";

/** `-1` means unlimited (enterprise). */
export function isUnlimitedLimit(value: number): boolean {
  return value < 0;
}

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

export function getPlan(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}

/** Credits granted per Stripe invoice for a billing cycle. */
export function creditsForBillingCycle(tier: PlanTier, cycle: BillingCycle): number {
  const plan = PLANS[tier];
  return cycle === "annual" ? plan.monthly_credits * 12 : plan.monthly_credits;
}

/** Map tier + cycle to Stripe catalog key (`enterprise` is annual-only). */
export function stripePlanKeyForTier(tier: PlanTier, cycle: BillingCycle): string | null {
  if (tier === "enterprise") {
    return cycle === "annual" ? "enterprise_annual" : null;
  }
  if (tier === "starter" && cycle === "monthly") {
    return "starter_monthly";
  }
  if (tier === "starter" && cycle === "annual") {
    return "starter_annual";
  }
  if (tier === "pro" && cycle === "monthly") {
    return "pro_monthly";
  }
  if (tier === "pro" && cycle === "annual") {
    return "pro_annual";
  }
  return null;
}

export function tierFromStripePlanKey(planKey: string): PlanTier | null {
  if (planKey.startsWith("starter_")) {
    return "starter";
  }
  if (planKey.startsWith("pro_")) {
    return "pro";
  }
  if (planKey.startsWith("enterprise_")) {
    return "enterprise";
  }
  return null;
}

export function billingCycleFromStripePlanKey(planKey: string): BillingCycle | null {
  if (planKey.endsWith("_monthly")) {
    return "monthly";
  }
  if (planKey.endsWith("_annual")) {
    return "annual";
  }
  return null;
}

/** Public API shape for `GET /api/v1/plans`. */
export type PlanCatalogEntry = PlanDefinition & { tier: PlanTier };

export function listPlanCatalog(): PlanCatalogEntry[] {
  return PLAN_TIERS.map((tier) => ({ tier, ...PLANS[tier] }));
}
