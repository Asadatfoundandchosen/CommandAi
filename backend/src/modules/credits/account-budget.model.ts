import mongoose, { Schema, type Types } from "mongoose";

import type { IAccount } from "../account/account.model.js";

/** Per-account spending budget (materialized from `accounts.budget` for API and dashboards). */
export interface IAccountBudget {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id: Types.ObjectId;
  /** Total credits allocated to this account. */
  allocated: number;
  /** Current spendable balance (`allocated - used`). */
  available: number;
  /** Lifetime credits consumed on this account. */
  used: number;
  /** Optional hard cap on total allocation (may be greater than `allocated`). */
  limit: number;
  /** Warn when `used / allocated` reaches this percent (1–100). */
  warning_threshold: number;
  last_usage?: Date | null;
  updated_at: Date;
}

const accountBudgetSchema = new Schema<IAccountBudget>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    account_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Account",
      index: true,
    },
    allocated: { type: Number, required: true, default: 0, min: 0 },
    available: { type: Number, required: true, default: 0, min: 0 },
    used: { type: Number, required: true, default: 0, min: 0 },
    limit: { type: Number, required: true, default: 0, min: 0 },
    warning_threshold: { type: Number, required: true, default: 80, min: 1, max: 100 },
    last_usage: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: false, updatedAt: "updated_at" },
    collection: "account_budgets",
  },
);

accountBudgetSchema.index(
  { org_id: 1, account_id: 1 },
  { unique: true },
);

export const DEFAULT_BUDGET_WARNING_THRESHOLD = 80;

/** Build budget fields from an account document. */
export function budgetFieldsFromAccount(account: IAccount): Omit<
  IAccountBudget,
  "_id" | "updated_at"
> & { updated_at: Date } {
  const allocated = account.budget?.allocated_credits ?? 0;
  const used = account.budget?.used_credits ?? 0;
  const available = Math.max(allocated - used, 0);
  return {
    org_id: account.org_id,
    account_id: account._id,
    allocated,
    available,
    used,
    limit: account.budget?.credit_limit ?? 0,
    warning_threshold:
      account.budget?.warning_threshold ?? DEFAULT_BUDGET_WARNING_THRESHOLD,
    last_usage: account.budget?.last_usage_at ?? null,
    updated_at: account.updated_at,
  };
}

export const AccountBudgetModel =
  mongoose.models.AccountBudget ??
  mongoose.model<IAccountBudget>("AccountBudget", accountBudgetSchema);
