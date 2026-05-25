import { inject, injectable } from "inversify";

import {
  PLANS,
  type PlanTier,
  billingCycleFromStripePlanKey,
  getPlan,
  isPlanTier,
  isUnlimitedLimit,
  tierFromStripePlanKey,
} from "../../config/plans.js";
import { TYPES } from "../../types.js";
import { AccountRepository } from "../../modules/account/account.repository.js";
import { OrganizationRepository } from "../../modules/organization/organization.repository.js";
import { UserRepository } from "../../modules/user/user.repository.js";

export class PlanLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly code: "max_accounts" | "max_users" | "feature_unavailable",
    public readonly limit?: number,
    public readonly current?: number,
  ) {
    super(message);
    this.name = "PlanLimitExceededError";
  }
}

@injectable()
export class PlanLimitsValidator {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.UserRepository)
    private readonly users: UserRepository,
  ) {}

  async resolveTier(orgId: string): Promise<PlanTier> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      return "starter";
    }
    if (org.subscription?.tier && isPlanTier(org.subscription.tier)) {
      return org.subscription.tier;
    }
    const planKey = org.stripe?.plan_key;
    if (planKey) {
      const tier = tierFromStripePlanKey(planKey);
      if (tier) {
        return tier;
      }
    }
    return "starter";
  }

  async getPlanForOrg(orgId: string) {
    const tier = await this.resolveTier(orgId);
    return { tier, ...getPlan(tier) };
  }

  async assertCanCreateAccount(orgId: string): Promise<void> {
    const tier = await this.resolveTier(orgId);
    const plan = getPlan(tier);
    if (isUnlimitedLimit(plan.max_accounts)) {
      return;
    }
    const count = await this.accounts.countActiveForOrg(orgId);
    if (count >= plan.max_accounts) {
      throw new PlanLimitExceededError(
        `Account limit reached for ${plan.name} plan (${plan.max_accounts} max)`,
        "max_accounts",
        plan.max_accounts,
        count,
      );
    }
  }

  async assertCanCreateUser(orgId: string): Promise<void> {
    const tier = await this.resolveTier(orgId);
    const plan = getPlan(tier);
    if (isUnlimitedLimit(plan.max_users)) {
      return;
    }
    const count = await this.users.countActiveForOrg(orgId);
    if (count >= plan.max_users) {
      throw new PlanLimitExceededError(
        `User limit reached for ${plan.name} plan (${plan.max_users} max)`,
        "max_users",
        plan.max_users,
        count,
      );
    }
  }

  async assertWithinLimitsForTier(orgId: string, targetTier: PlanTier): Promise<void> {
    const plan = getPlan(targetTier);
    if (!isUnlimitedLimit(plan.max_accounts)) {
      const accounts = await this.accounts.countActiveForOrg(orgId);
      if (accounts > plan.max_accounts) {
        throw new PlanLimitExceededError(
          `Cannot change plan: ${accounts} accounts exceed ${plan.name} limit of ${plan.max_accounts}`,
          "max_accounts",
          plan.max_accounts,
          accounts,
        );
      }
    }
    if (!isUnlimitedLimit(plan.max_users)) {
      const users = await this.users.countActiveForOrg(orgId);
      if (users > plan.max_users) {
        throw new PlanLimitExceededError(
          `Cannot change plan: ${users} users exceed ${plan.name} limit of ${plan.max_users}`,
          "max_users",
          plan.max_users,
          users,
        );
      }
    }
  }

  orgHasFeature(tier: PlanTier, feature: string): boolean {
    const plan = PLANS[tier];
    if (plan.features.includes("all")) {
      return true;
    }
    return plan.features.includes(feature);
  }

  async assertOrgHasFeature(orgId: string, feature: string): Promise<void> {
    const tier = await this.resolveTier(orgId);
    if (!this.orgHasFeature(tier, feature)) {
      throw new PlanLimitExceededError(
        `Feature "${feature}" is not available on the ${getPlan(tier).name} plan`,
        "feature_unavailable",
      );
    }
  }

  subscriptionFieldsFromStripePlanKey(planKey: string): {
    tier: PlanTier;
    billing_cycle: "monthly" | "annual";
  } | null {
    const tier = tierFromStripePlanKey(planKey);
    const billing_cycle = billingCycleFromStripePlanKey(planKey);
    if (!tier || !billing_cycle) {
      return null;
    }
    return { tier, billing_cycle };
  }
}
