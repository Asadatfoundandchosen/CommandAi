import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { isStripeConfigured } from "./stripe.client.js";
import { StripeNotConfiguredError, StripeService } from "./stripe.service.js";
import { StripeWebhookService, StripeWebhookError } from "./stripe-webhook.service.js";
import {
  createStripeCustomerBodySchema,
  createStripeSubscriptionBodySchema,
  organizationIdParamSchema,
} from "./billing.validation.js";
import { TYPES } from "../../types.js";

@injectable()
export class BillingController {
  constructor(
    @inject(TYPES.StripeService) private readonly stripe: StripeService,
    @inject(TYPES.StripeWebhookService) private readonly stripeWebhooks: StripeWebhookService,
  ) {}

  private stripeUnavailable(res: Response): boolean {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not configured (set STRIPE_SECRET_KEY)" });
      return true;
    }
    return false;
  }

  /** POST /api/billing/stripe/catalog/sync — create Products/Prices and store IDs on organizations. */
  syncCatalog = async (_req: Request, res: Response): Promise<void> => {
    if (this.stripeUnavailable(res)) {
      return;
    }
    try {
      const catalog = await this.stripe.syncPlanCatalog();
      res.status(200).json({ data: catalog });
    } catch (e) {
      if (e instanceof StripeNotConfiguredError) {
        res.status(503).json({ error: e.message });
        return;
      }
      throw e;
    }
  };

  /** POST /api/billing/stripe/organizations/:id/customer */
  createCustomer = async (req: Request, res: Response): Promise<void> => {
    if (this.stripeUnavailable(res)) {
      return;
    }
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const body = createStripeCustomerBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const org = await this.stripe.ensureCustomerForOrg(p.data.id, body.data.billing_email);
      res.status(200).json({
        data: {
          org_id: String(org._id),
          stripe_customer_id: org.stripe?.customer_id,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create Stripe customer";
      res.status(400).json({ error: message });
    }
  };

  /** POST /api/billing/stripe/organizations/:id/subscription */
  createSubscription = async (req: Request, res: Response): Promise<void> => {
    if (this.stripeUnavailable(res)) {
      return;
    }
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const body = createStripeSubscriptionBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const org = await this.stripe.subscribeOrgToPlan(p.data.id, body.data.plan_key);
      res.status(201).json({
        data: {
          org_id: String(org._id),
          stripe_customer_id: org.stripe?.customer_id,
          stripe_subscription_id: org.stripe?.subscription_id,
          stripe_price_id: org.stripe?.price_id,
          plan_key: org.stripe?.plan_key,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create subscription";
      res.status(400).json({ error: message });
    }
  };

  /** POST /api/billing/stripe/webhook — Stripe-signed events (raw body). */
  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    if (this.stripeUnavailable(res)) {
      return;
    }
    const signature = req.headers["stripe-signature"];
    const raw =
      req.body instanceof Buffer
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body
          : null;
    if (!raw) {
      res.status(400).json({ error: "Raw body required for Stripe webhook" });
      return;
    }
    try {
      const event = this.stripeWebhooks.constructEvent(
        raw,
        typeof signature === "string" ? signature : undefined,
      );
      await this.stripeWebhooks.handleEvent(event);
      res.status(200).json({ received: true });
    } catch (e) {
      if (e instanceof StripeWebhookError) {
        res.status(400).json({ error: e.message });
        return;
      }
      throw e;
    }
  };
}
