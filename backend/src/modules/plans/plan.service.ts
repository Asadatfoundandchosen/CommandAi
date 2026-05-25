import { inject, injectable } from "inversify";

import {
  type BillingCycle,
  type PlanCatalogEntry,
  type PlanTier,
  getPlan,
  listPlanCatalog,
  stripePlanKeyForTier,
} from "../../config/plans.js";
import { PlanLimitsValidator } from "../../common/validators/plan-limits.validator.js";
import { TYPES } from "../../types.js";
import { AccountRepository } from "../account/account.repository.js";
import { UserRepository } from "../user/user.repository.js";
import { isStripeConfigured } from "../billing/stripe.client.js";
import { StripeService } from "../billing/stripe.service.js";
import type { StripePlanKey } from "../billing/stripe-plans.js";
import { isStripePlanKey } from "../billing/stripe-plans.js";
import type { IOrganization } from "../organization/organization.model.js";
import { OrganizationRepository } from "../organization/organization.repository.js";

export type OrgPlanSummary = {
  tier: PlanTier;
  billing_cycle: BillingCycle | null;
  plan: ReturnType<typeof getPlan>;
  usage: {
    accounts: number;
    users: number;
  };
};

export type ChangePlanResult = {
  organization: IOrganization;
  previous_tier: PlanTier;
  new_tier: PlanTier;
  billing_cycle: BillingCycle;
  direction: "upgrade" | "downgrade" | "same";
};

const TIER_RANK: Record<PlanTier, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
};

@injectable()
export class PlanService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.UserRepository)
    private readonly users: UserRepository,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
    @inject(TYPES.StripeService)
    private readonly stripe: StripeService,
  ) {}

  listCatalog(): PlanCatalogEntry[] {
    return listPlanCatalog();
  }

  async getOrgPlan(orgId: string): Promise<OrgPlanSummary | null> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      return null;
    }
    const tier = await this.planLimits.resolveTier(orgId);
    const plan = getPlan(tier);
    const billing_cycle = org.subscription?.billing_cycle ?? null;
    const accounts = await this.accounts.countActiveForOrg(orgId);
    const users = await this.users.countActiveForOrg(orgId);

    return {
      tier,
      billing_cycle,
      plan,
      usage: { accounts, users },
    };
  }

  /**
   * Upgrade or downgrade org plan. Updates Stripe subscription when configured;
   * always updates `subscription.tier`, features, and credit expectations on the org.
   */
  async changePlan(
    orgId: string,
    tier: PlanTier,
    billing_cycle: BillingCycle,
  ): Promise<ChangePlanResult> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const previousTier = await this.planLimits.resolveTier(orgId);
    const direction = compareTierChange(previousTier, tier);

    if (direction === "downgrade") {
      await this.planLimits.assertWithinLimitsForTier(orgId, tier);
    }

    const planKeyRaw = stripePlanKeyForTier(tier, billing_cycle);
    if (!planKeyRaw) {
      throw new Error(
        `${tier} plan does not support ${billing_cycle} billing; use annual for enterprise`,
      );
    }
    if (!isStripePlanKey(planKeyRaw)) {
      throw new Error(`Invalid Stripe plan key: ${planKeyRaw}`);
    }
    const planKey: StripePlanKey = planKeyRaw;

    let updated: IOrganization;
    if (isStripeConfigured() && org.stripe?.customer_id) {
      updated = await this.stripe.changeOrgSubscriptionPlan(orgId, planKey);
    } else {
      updated = await this.applyPlanToOrg(orgId, tier, billing_cycle, planKey);
    }

    return {
      organization: updated,
      previous_tier: previousTier,
      new_tier: tier,
      billing_cycle,
      direction,
    };
  }

  async applyPlanToOrg(
    orgId: string,
    tier: PlanTier,
    billing_cycle: BillingCycle,
    planKey?: StripePlanKey,
  ): Promise<IOrganization> {
    const plan = getPlan(tier);
    const patch: Record<string, unknown> = {
      "subscription.tier": tier,
      "subscription.billing_cycle": billing_cycle,
      "settings.features": [...plan.features],
    };
    if (planKey) {
      patch["stripe.plan_key"] = planKey;
    }
    const row = await this.organizations.updateById(orgId, { $set: patch });
    if (!row) {
      throw new Error(`Failed to update organization plan: ${orgId}`);
    }
    return row;
  }
}

function compareTierChange(
  from: PlanTier,
  to: PlanTier,
): "upgrade" | "downgrade" | "same" {
  if (from === to) {
    return "same";
  }
  return TIER_RANK[to] > TIER_RANK[from] ? "upgrade" : "downgrade";
}
