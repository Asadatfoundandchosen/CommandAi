import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { isStripeConfigured } from "../billing/stripe.client.js";
import { StripeNotConfiguredError } from "../billing/stripe.service.js";
import { TYPES } from "../../types.js";
import {
  CreditPurchaseError,
  CreditPurchaseService,
} from "./credit-purchase.service.js";
import { CreditAlertService } from "./credit-alert.service.js";
import { CreditRatesService } from "./credit-rates.service.js";
import { CreditHistoryService } from "./credit-history.service.js";
import { CreditService } from "./credit.service.js";
import {
  creditTransactionsQuerySchema,
  parseCreditTransactionFilters,
  purchaseCreditsBodySchema,
  updateCreditAlertSettingsBodySchema,
} from "./credits.validation.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

function actorUserIdFromJwt(req: Request): string | undefined {
  const sub = req.user?.sub;
  return typeof sub === "string" && /^[a-fA-F0-9]{24}$/.test(sub) ? sub : undefined;
}

@injectable()
export class CreditsController {
  constructor(
    @inject(TYPES.CreditPurchaseService)
    private readonly creditPurchase: CreditPurchaseService,
    @inject(TYPES.CreditService)
    private readonly credits: CreditService,
    @inject(TYPES.CreditRatesService)
    private readonly rateCard: CreditRatesService,
    @inject(TYPES.CreditAlertService)
    private readonly creditAlerts: CreditAlertService,
    @inject(TYPES.CreditHistoryService)
    private readonly creditHistory: CreditHistoryService,
  ) {}

  /** `GET /api/v1/credits/transactions` — paginated ledger with summary aggregations. */
  transactions = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const parsed = creditTransactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const filters = parseCreditTransactionFilters(parsed.data);
      const data = await this.creditHistory.getTransactions(orgId, filters);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid transaction filters";
      res.status(400).json({ error: message });
    }
  };

  /** `GET /api/v1/credits/transactions/summary` — aggregations only (same filters as list). */
  transactionsSummary = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const parsed = creditTransactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const filters = parseCreditTransactionFilters(parsed.data);
      const data = await this.creditHistory.getSummary(orgId, filters);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid transaction filters";
      res.status(400).json({ error: message });
    }
  };

  /** `GET /api/v1/credits/transactions/export` — CSV export (max 10k rows). */
  transactionsExport = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const parsed = creditTransactionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const filters = parseCreditTransactionFilters(parsed.data);
      const csv = await this.creditHistory.exportTransactionsCsv(orgId, filters);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="credit-transactions-${stamp}.csv"`,
      );
      res.status(200).send(csv);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid export filters";
      res.status(400).json({ error: message });
    }
  };

  /** `GET /api/v1/credits/rates` — org rate card (defaults or enterprise custom). */
  rates = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const data = await this.rateCard.getRatesForOrg(orgId);
    res.status(200).json({ data });
  };

  /** `GET /api/v1/credits/balance` — org credit balance (JWT org_admin). */
  balance = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const credit = await this.credits.getByOrgId(orgId);
    res.status(200).json({
      data: credit ?? {
        org_id: orgId,
        balance: 0,
        reserved: 0,
        lifetime_purchased: 0,
        lifetime_used: 0,
      },
    });
  };

  /** `GET /api/v1/credits/alerts/settings` — thresholds + notification preferences. */
  getAlertSettings = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const [thresholds, preferences, snapshot] = await Promise.all([
      this.creditAlerts.getThresholdsForOrg(orgId),
      this.creditAlerts.getNotificationPreferences(orgId),
      this.creditAlerts.getBalanceSnapshot(orgId),
    ]);
    res.status(200).json({
      data: {
        thresholds,
        preferences,
        balance: snapshot,
      },
    });
  };

  /** `PUT /api/v1/credits/alerts/settings` — configure thresholds and notification prefs. */
  updateAlertSettings = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const parsed = updateCreditAlertSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const data = await this.creditAlerts.updateAlertSettings(orgId, parsed.data);
    res.status(200).json({ data });
  };

  /** `POST /api/v1/credits/purchase` — Stripe PaymentIntent for credit pack (JWT org_admin). */
  purchase = async (req: Request, res: Response): Promise<void> => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not configured (set STRIPE_SECRET_KEY)" });
      return;
    }

    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }

    const parsed = purchaseCreditsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const result = await this.creditPurchase.purchaseCredits(
        orgId,
        parsed.data.amount,
        actorUserIdFromJwt(req),
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof StripeNotConfiguredError) {
        res.status(503).json({ error: e.message });
        return;
      }
      if (e instanceof CreditPurchaseError) {
        res.status(400).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to start credit purchase";
      res.status(400).json({ error: message });
    }
  };
}
