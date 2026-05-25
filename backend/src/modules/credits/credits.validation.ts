import { z } from "zod";

import type { CreditTransactionType } from "./credit.model.js";
import {
  CREDIT_PURCHASE_MAX_AMOUNT,
  CREDIT_PURCHASE_MIN_AMOUNT,
} from "./credit-purchase.constants.js";

export const purchaseCreditsBodySchema = z.object({
  amount: z
    .number()
    .int()
    .min(CREDIT_PURCHASE_MIN_AMOUNT)
    .max(CREDIT_PURCHASE_MAX_AMOUNT),
});

export type PurchaseCreditsBody = z.infer<typeof purchaseCreditsBodySchema>;

const rateValueSchema = z.number().int().min(0).max(1_000_000);

/** Platform admin body for enterprise custom rate overrides. */
export const setOrgCreditRatesBodySchema = z
  .object({
    signal_processed: rateValueSchema.optional(),
    action_executed: rateValueSchema.optional(),
    hitl_decision: rateValueSchema.optional(),
    data_sync_gb: rateValueSchema.optional(),
    report_generated: rateValueSchema.optional(),
  })
  .refine(
    (body) =>
      body.signal_processed !== undefined ||
      body.action_executed !== undefined ||
      body.hitl_decision !== undefined ||
      body.data_sync_gb !== undefined ||
      body.report_generated !== undefined,
    { message: "Provide at least one rate override" },
  );

export type SetOrgCreditRatesBody = z.infer<typeof setOrgCreditRatesBodySchema>;

const alertLevelSchema = z.enum(["warning", "critical", "urgent"]);

export const creditAlertThresholdSchema = z.object({
  percent: z.number().min(1).max(100),
  level: alertLevelSchema,
});

export const updateCreditAlertSettingsBodySchema = z.object({
  preferences: z
    .object({
      credit_alerts_enabled: z.boolean().optional(),
      email_enabled: z.boolean().optional(),
      in_app_enabled: z.boolean().optional(),
    })
    .optional(),
  thresholds: z.array(creditAlertThresholdSchema).min(1).max(10).optional(),
});

export type UpdateCreditAlertSettingsBody = z.infer<
  typeof updateCreditAlertSettingsBodySchema
>;

const objectIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/);

export const creditTransactionTypeSchema = z.enum([
  "purchase",
  "allocation",
  "consumption",
  "refund",
  "expiry",
]);

/** Query filters for credit transaction history and CSV export. */
export const creditTransactionsQuerySchema = z.object({
  account_id: objectIdSchema.optional(),
  type: creditTransactionTypeSchema.optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type CreditTransactionsQuery = z.infer<typeof creditTransactionsQuerySchema>;

function parseOptionalDate(value: string | undefined, field: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${field} date`);
  }
  return d;
}

export function parseCreditTransactionFilters(query: CreditTransactionsQuery): {
  accountId?: string;
  type?: CreditTransactionType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
} {
  return {
    accountId: query.account_id,
    type: query.type,
    from: parseOptionalDate(query.from, "from"),
    to: parseOptionalDate(query.to, "to"),
    limit: query.limit,
    offset: query.offset,
  };
}
