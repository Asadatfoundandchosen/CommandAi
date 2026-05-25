import { inject, injectable } from "inversify";
import { Types } from "mongoose";
import type Stripe from "stripe";

import { config } from "@config/index.js";
import { TYPES } from "../../types.js";
import { isStripeConfigured, requireStripe } from "../billing/stripe.client.js";
import { StripeNotConfiguredError, StripeService } from "../billing/stripe.service.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import {
  CREDIT_PURCHASE_MAX_AMOUNT,
  CREDIT_PURCHASE_METADATA_TYPE,
  CREDIT_PURCHASE_MIN_AMOUNT,
  CREDIT_PURCHASE_PRICE_USD,
  CREDIT_PURCHASE_SYSTEM_ACTOR,
  creditPurchaseDescription,
  creditsToUsdCents,
} from "./credit-purchase.constants.js";
import { CreditTransactionModel } from "./credit.model.js";
import { CreditService } from "./credit.service.js";

export class CreditPurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditPurchaseError";
  }
}

export type PurchaseCreditsResult = {
  clientSecret: string;
  publishableKey: string | null;
  amountCredits: number;
  totalUsdCents: number;
  pricePerCreditUsd: number;
};

@injectable()
export class CreditPurchaseService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.StripeService)
    private readonly stripeBilling: StripeService,
    @inject(TYPES.CreditService)
    private readonly credits: CreditService,
  ) {}

  /**
   * Create a Stripe PaymentIntent for an org admin credit pack purchase.
   * Credits are applied on `payment_intent.succeeded` webhook (idempotent).
   */
  async purchaseCredits(
    orgId: string,
    amount: number,
    actorUserId?: string,
  ): Promise<PurchaseCreditsResult> {
    if (!isStripeConfigured()) {
      throw new StripeNotConfiguredError();
    }
    if (
      amount < CREDIT_PURCHASE_MIN_AMOUNT ||
      amount > CREDIT_PURCHASE_MAX_AMOUNT ||
      !Number.isInteger(amount)
    ) {
      throw new CreditPurchaseError(
        `Credit amount must be an integer between ${CREDIT_PURCHASE_MIN_AMOUNT} and ${CREDIT_PURCHASE_MAX_AMOUNT}`,
      );
    }

    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new CreditPurchaseError(`Organization not found: ${orgId}`);
    }

    const orgWithCustomer = await this.stripeBilling.ensureCustomerForOrg(
      orgId,
      org.billing_email,
    );
    const customerId = orgWithCustomer.stripe?.customer_id;
    if (!customerId) {
      throw new CreditPurchaseError("Stripe customer could not be created for organization");
    }

    const totalUsdCents = creditsToUsdCents(amount);
    if (totalUsdCents < 50) {
      throw new CreditPurchaseError("Purchase total must be at least $0.50 (Stripe minimum)");
    }

    const stripe = requireStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalUsdCents,
      currency: "usd",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        org_id: orgId,
        credits: String(amount),
        purchase_type: CREDIT_PURCHASE_METADATA_TYPE,
        ...(actorUserId ? { actor_user_id: actorUserId } : {}),
      },
    });

    if (!paymentIntent.client_secret) {
      throw new CreditPurchaseError("Stripe did not return a client secret");
    }

    return {
      clientSecret: paymentIntent.client_secret,
      publishableKey: config.stripe?.publishableKey ?? null,
      amountCredits: amount,
      totalUsdCents,
      pricePerCreditUsd: CREDIT_PURCHASE_PRICE_USD,
    };
  }

  /** Webhook: apply purchased credits to org balance immediately on successful payment. */
  async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    if (paymentIntent.metadata?.purchase_type !== CREDIT_PURCHASE_METADATA_TYPE) {
      return;
    }

    const orgId = paymentIntent.metadata?.org_id;
    const creditsRaw = paymentIntent.metadata?.credits;
    if (!orgId || !creditsRaw) {
      process.stderr.write(
        `[credit-purchase] payment_intent.succeeded missing metadata pi=${paymentIntent.id}\n`,
      );
      return;
    }

    const credits = Number.parseInt(creditsRaw, 10);
    if (!Number.isInteger(credits) || credits <= 0) {
      process.stderr.write(
        `[credit-purchase] invalid credits metadata pi=${paymentIntent.id} credits=${creditsRaw}\n`,
      );
      return;
    }

    const org = await this.organizations.findById(orgId);
    if (!org) {
      process.stderr.write(
        `[credit-purchase] org not found pi=${paymentIntent.id} org=${orgId}\n`,
      );
      return;
    }

    const description = creditPurchaseDescription(paymentIntent.id);
    const existing = await CreditTransactionModel.findOne({
      org_id: new Types.ObjectId(orgId),
      type: "purchase",
      description,
    }).lean();
    if (existing) {
      process.stdout.write(
        `[credit-purchase] already credited pi=${paymentIntent.id} org=${orgId}\n`,
      );
      return;
    }

    const actor =
      paymentIntent.metadata?.actor_user_id &&
      /^[a-fA-F0-9]{24}$/.test(paymentIntent.metadata.actor_user_id)
        ? paymentIntent.metadata.actor_user_id
        : CREDIT_PURCHASE_SYSTEM_ACTOR;

    await this.credits.addCredits({
      orgId,
      type: "purchase",
      amount: credits,
      referenceType: "manual",
      referenceId: String(org._id),
      description,
      createdBy: actor,
    });

    process.stdout.write(
      `[credit-purchase] payment_intent.succeeded org=${orgId} +${credits} credits pi=${paymentIntent.id}\n`,
    );
  }
}
