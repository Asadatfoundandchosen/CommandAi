import { inject, injectable } from "inversify";
import type Stripe from "stripe";

import { config } from "@config/index.js";
import { TYPES } from "../../types.js";
import { queues } from "../../infrastructure/queue/queues/index.js";
import type { NotificationJob } from "../../infrastructure/queue/queues/notification.queue.js";
import { AuditService } from "../audit/audit.service.js";
import { ContractRepository } from "../contract/contract.repository.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import { isStripeConfigured, requireStripe } from "./stripe.client.js";
import { CreditPurchaseService } from "../credits/credit-purchase.service.js";
import { StripeService } from "./stripe.service.js";

export class StripeWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookError";
  }
}

@injectable()
export class StripeWebhookService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
    @inject(TYPES.StripeService)
    private readonly stripeBilling: StripeService,
    @inject(TYPES.AuditService)
    private readonly audit: AuditService,
    @inject(TYPES.CreditPurchaseService)
    private readonly creditPurchase: CreditPurchaseService,
  ) {}

  constructEvent(payload: Buffer, signature: string | undefined): Stripe.Event {
    if (!isStripeConfigured()) {
      throw new StripeWebhookError("Stripe is not configured");
    }
    const secret = requireStripe();
    const webhookSecret = requireWebhookSecret();
    if (!signature) {
      throw new StripeWebhookError("Missing Stripe-Signature header");
    }
    return secret.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "invoice.paid":
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        return;
      case "invoice.payment_failed":
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        return;
      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        return;
      case "payment_intent.succeeded":
        await this.creditPurchase.handlePaymentSuccess(
          event.data.object as Stripe.PaymentIntent,
        );
        return;
      default:
        return;
    }
  }

  private async resolveOrgFromInvoice(invoice: Stripe.Invoice): Promise<{
    orgId: string;
    org: NonNullable<Awaited<ReturnType<OrganizationRepository["findById"]>>>;
  } | null> {
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      return null;
    }

    let org = await this.organizations.findByStripeCustomerId(customerId);
    if (!org) {
      const orgId = invoice.metadata?.org_id;
      if (orgId) {
        org = await this.organizations.findById(orgId);
      }
    }
    if (!org) {
      return null;
    }
    return { orgId: String(org._id), org };
  }

  /** `invoice.paid` → allocate credits to org billing pool. */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const resolved = await this.resolveOrgFromInvoice(invoice);
    if (!resolved) {
      process.stderr.write(`[stripe-webhook] invoice.paid: org not found for invoice ${invoice.id}\n`);
      return;
    }

    const { orgId, org } = resolved;
    const line = invoice.lines?.data?.[0];
    const priceId =
      typeof line?.price === "string"
        ? line.price
        : line?.price && typeof line.price === "object"
          ? line.price.id
          : org.stripe?.price_id;

    const credits = priceId ? this.stripeBilling.creditsForPriceId(org, priceId) : 0;
    if (credits <= 0) {
      process.stderr.write(
        `[stripe-webhook] invoice.paid: no credit mapping for price ${String(priceId)} org=${orgId}\n`,
      );
      return;
    }

    const allocated = org.billing?.allocated_credits ?? 0;
    await this.organizations.updateById(orgId, {
      $inc: { "billing.allocated_credits": credits },
      $set: { status: "active" },
    });

    try {
      await this.audit.indexAuditEvent({
        org_id: orgId,
        action: "billing.credits_allocated",
        resource: "organization",
        resource_id: orgId,
        changes: {
          invoice_id: invoice.id,
          credits_added: credits,
          allocated_credits_after: allocated + credits,
          price_id: priceId,
        },
      });
    } catch (e) {
      process.stderr.write(`[stripe-webhook] audit failed: ${String(e)}\n`);
    }

    process.stdout.write(
      `[stripe-webhook] invoice.paid org=${orgId} +${credits} credits (invoice ${invoice.id})\n`,
    );
  }

  /** `invoice.payment_failed` → notify org admins and suspend organization. */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const resolved = await this.resolveOrgFromInvoice(invoice);
    if (!resolved) {
      return;
    }
    const { orgId } = resolved;

    await this.organizations.updateById(orgId, {
      $set: { status: "suspended" },
    });

    const job: NotificationJob = {
      orgId,
      recipientKey: `org-admin:${orgId}`,
      templateId: "stripe-payment-failed",
      payload: {
        invoiceId: invoice.id,
        amountDue: invoice.amount_due,
        attemptCount: invoice.attempt_count,
        message: "Payment failed — your organization has been suspended until billing is resolved.",
      },
    };
    await queues.notifications.add("stripe-payment-failed", job, {
      jobId: `stripe-payment-failed:${orgId}:${invoice.id}`,
      removeOnComplete: true,
    });

    process.stdout.write(`[stripe-webhook] invoice.payment_failed org=${orgId} suspended\n`);
  }

  /** `customer.subscription.deleted` → deactivate org and terminate active contract. */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id;
    if (!customerId) {
      return;
    }

    const org = await this.organizations.findByStripeCustomerId(customerId);
    if (!org) {
      return;
    }
    const orgId = String(org._id);

    await this.organizations.updateById(orgId, {
      $set: { status: "suspended" },
      $unset: {
        "stripe.subscription_id": "",
        "stripe.price_id": "",
        "stripe.plan_key": "",
      },
    });

    const activeContract = await this.contracts.findCurrentActiveForOrg(orgId);
    if (activeContract) {
      await this.contracts.updateForOrg(String(activeContract._id), orgId, {
        $set: {
          status: "terminated",
          updated_by: activeContract.updated_by,
        },
      });
    }

    process.stdout.write(`[stripe-webhook] subscription.deleted org=${orgId} deactivated\n`);
  }
}

function requireWebhookSecret(): string {
  const secret = config.stripe?.webhookSecret;
  if (!secret) {
    throw new StripeWebhookError("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return secret;
}
