import mongoose from "mongoose";

import type { CreditTransactionType } from "./credit.model.js";

export type TransactionFilters = {
  accountId?: string;
  type?: CreditTransactionType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export type BuiltTransactionQuery = {
  filter: Record<string, unknown>;
  limit: number;
  offset: number;
};

const TRANSACTION_TYPES: CreditTransactionType[] = [
  "purchase",
  "allocation",
  "consumption",
  "refund",
  "expiry",
];

export function isCreditTransactionType(value: string): value is CreditTransactionType {
  return (TRANSACTION_TYPES as string[]).includes(value);
}

/** Build tenant-scoped Mongo filter for credit transaction history. */
export function buildTransactionQuery(
  orgId: string,
  filters: TransactionFilters,
): BuiltTransactionQuery {
  const filter: Record<string, unknown> = {
    org_id: new mongoose.Types.ObjectId(orgId),
  };

  if (filters.accountId) {
    filter.account_id = new mongoose.Types.ObjectId(filters.accountId);
  }
  if (filters.type) {
    filter.type = filters.type;
  }

  const createdAt: Record<string, Date> = {};
  if (filters.from) {
    createdAt.$gte = filters.from;
  }
  if (filters.to) {
    createdAt.$lte = filters.to;
  }
  if (Object.keys(createdAt).length > 0) {
    filter.created_at = createdAt;
  }

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  return { filter, limit, offset };
}

/** Escape a CSV field (RFC 4180-style). */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
