import { inject, injectable } from "inversify";
import type Stripe from "stripe";

import { TYPES } from "../../types.js";
import type { IOrganization } from "../organization/organization.model.js";
import { OrganizationModel } from "../organization/organization.model.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import { isStripeConfigured, requireStripe } from "./stripe.client.js";
import {
  billingCycleFromStripePlanKey,
  creditsForBillingCycle,
  getPlan,
  tierFromStripePlanKey,
} from "../../config/plans.js";
import {
  STRIPE_PLAN_CATALOG,
  STRIPE_PLAN_KEYS,
  type StripePlanKey,
  getPlanDefinition,
  isStripePlanKey,
} from "./stripe-plans.js";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (set STRIPE_SECRET_KEY)");
    this.name = "StripeNotConfiguredError";
  }
}

export type StripeCatalogSyncResult = {
  product_ids: Partial<Record<StripePlanKey, string>>;
  price_ids: Partial<Record<StripePlanKey, string>>;
};

@injectable()
export class StripeService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
  ) {}

  private stripe(): Stripe {
    if (!isStripeConfigured()) {
      throw new StripeNotConfiguredError();
    }
    return requireStripe();
  }

  async createCustomer(org: IOrganization): Promise<Stripe.Customer> {
    const stripe = this.stripe();
    return stripe.customers.create({
      email: org.billing_email,
      name: org.name,
      metadata: { org_id: String(org._id) },
    });
  }

  async createSubscription(
    customerId: string,
    priceId: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    const stripe = this.stripe();
    return stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata,
    });
  }

  /**
   * Ensure a Stripe Customer exists for the org; persists `stripe.customer_id` on the organization.
   */
  async ensureCustomerForOrg(orgId: string, billingEmail?: string): Promise<IOrganization> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }
    if (org.stripe?.customer_id) {
      return org;
    }

    const email = billingEmail ?? org.billing_email;
    if (!email) {
      throw new Error("billing_email is required to create a Stripe customer");
    }

    const customer = await this.createCustomer({ ...org, billing_email: email });
    const updated = await this.organizations.updateById(orgId, {
      $set: {
        billing_email: email,
        "stripe.customer_id": customer.id,
      },
    });
    if (!updated) {
      throw new Error(`Failed to persist Stripe customer for org ${orgId}`);
    }
    return updated;
  }

  /**
   * Create or replace subscription for an org (platform admin). Requires catalog `price_ids` on org or from sync.
   */
  async subscribeOrgToPlan(orgId: string, planKey: StripePlanKey): Promise<IOrganization> {
    if (!isStripePlanKey(planKey)) {
      throw new Error(`Invalid plan key: ${planKey}`);
    }

    let org = await this.ensureCustomerForOrg(orgId);
    const priceId = this.resolvePriceId(org, planKey);
    if (!priceId) {
      throw new Error(
        `No Stripe price for ${planKey}. Run POST /api/billing/stripe/catalog/sync first.`,
      );
    }

    const customerId = org.stripe?.customer_id;
    if (!customerId) {
      throw new Error("Stripe customer missing after ensureCustomerForOrg");
    }

    const subscription = await this.createSubscription(customerId, priceId, {
      org_id: orgId,
      plan_key: planKey,
    });

    const tier = tierFromStripePlanKey(planKey);
    const billing_cycle = billingCycleFromStripePlanKey(planKey);
    const planDef = tier ? getPlan(tier) : null;

    const updated = await this.organizations.updateById(orgId, {
      $set: {
        status: "active",
        "stripe.subscription_id": subscription.id,
        "stripe.price_id": priceId,
        "stripe.plan_key": planKey,
        ...(tier && billing_cycle
          ? {
              "subscription.tier": tier,
              "subscription.billing_cycle": billing_cycle,
            }
          : {}),
        ...(planDef ? { "settings.features": [...planDef.features] } : {}),
      },
    });
    if (!updated) {
      throw new Error(`Failed to persist subscription for org ${orgId}`);
    }
    return updated;
  }

  /** Upgrade/downgrade an existing Stripe subscription to a new catalog price. */
  async changeOrgSubscriptionPlan(orgId: string, planKey: StripePlanKey): Promise<IOrganization> {
    if (!isStripePlanKey(planKey)) {
      throw new Error(`Invalid plan key: ${planKey}`);
    }

    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const priceId = this.resolvePriceId(org, planKey);
    if (!priceId) {
      throw new Error(`No Stripe price for ${planKey}. Run catalog sync first.`);
    }

    const tier = tierFromStripePlanKey(planKey);
    const billing_cycle = billingCycleFromStripePlanKey(planKey);
    if (!tier || !billing_cycle) {
      throw new Error(`Cannot resolve tier from plan key ${planKey}`);
    }
    const planDef = getPlan(tier);

    const customerId = org.stripe?.customer_id;
    if (!customerId) {
      return this.subscribeOrgToPlan(orgId, planKey);
    }

    const stripe = this.stripe();
    let subscriptionId = org.stripe?.subscription_id;

    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const itemId = sub.items.data[0]?.id;
      if (!itemId) {
        throw new Error("Stripe subscription has no line items");
      }
      const updatedSub = await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { org_id: orgId, plan_key: planKey },
      });
      subscriptionId = updatedSub.id;
    } else {
      const created = await this.createSubscription(customerId, priceId, {
        org_id: orgId,
        plan_key: planKey,
      });
      subscriptionId = created.id;
    }

    const updated = await this.organizations.updateById(orgId, {
      $set: {
        status: "active",
        "stripe.subscription_id": subscriptionId,
        "stripe.price_id": priceId,
        "stripe.plan_key": planKey,
        "subscription.tier": tier,
        "subscription.billing_cycle": billing_cycle,
        "settings.features": [...planDef.features],
      },
    });
    if (!updated) {
      throw new Error(`Failed to persist plan change for org ${orgId}`);
    }
    return updated;
  }

  /**
   * Create Stripe Products + recurring Prices for all catalog plans.
   * Persists `product_ids` / `price_ids` on every organization (shared catalog).
   */
  async syncPlanCatalog(): Promise<StripeCatalogSyncResult> {
    const stripe = this.stripe();
    const product_ids: Partial<Record<StripePlanKey, string>> = {};
    const price_ids: Partial<Record<StripePlanKey, string>> = {};

    for (const key of STRIPE_PLAN_KEYS) {
      const def = STRIPE_PLAN_CATALOG[key];
      const product = await stripe.products.create({
        name: def.product_name,
        metadata: {
          plan_key: key,
          billing_plan: def.plan,
          billing_cycle: def.billing_cycle,
        },
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: def.unit_amount_cents,
        recurring: {
          interval: def.recurring_interval,
          interval_count: def.recurring_interval_count,
        },
        metadata: { plan_key: key },
      });
      product_ids[key] = product.id;
      price_ids[key] = price.id;
    }

    await OrganizationModel.updateMany(
      {},
      {
        $set: {
          "stripe.product_ids": product_ids,
          "stripe.price_ids": price_ids,
        },
      },
    );

    return { product_ids, price_ids };
  }

  resolvePriceId(org: IOrganization, planKey: StripePlanKey): string | undefined {
    return org.stripe?.price_ids?.[planKey];
  }

  resolvePlanKey(org: IOrganization, priceId: string): StripePlanKey | null {
    const map = org.stripe?.price_ids ?? {};
    for (const key of STRIPE_PLAN_KEYS) {
      if (map[key] === priceId) {
        return key;
      }
    }
    return null;
  }

  creditsForPriceId(org: IOrganization, priceId: string): number {
    const planKey = this.resolvePlanKey(org, priceId);
    if (!planKey) {
      return 0;
    }
    const tier = tierFromStripePlanKey(planKey);
    const cycle = billingCycleFromStripePlanKey(planKey);
    if (tier && cycle) {
      return creditsForBillingCycle(tier, cycle);
    }
    return getPlanDefinition(planKey).credit_allocation;
  }
}
