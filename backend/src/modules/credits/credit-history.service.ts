import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { TYPES } from "../../types.js";
import { AccountRepository } from "../account/account.repository.js";
import type { ICreditTransaction } from "./credit.model.js";
import { CreditTransactionModel } from "./credit.model.js";
import {
  buildTransactionQuery,
  escapeCsvField,
  type TransactionFilters,
} from "./credit-history.logic.js";

export type CreditTransactionDto = {
  id: string;
  org_id: string;
  account_id: string | null;
  account_name: string | null;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  description: string;
  created_by: string;
  created_at: string;
};

export type TransactionPagination = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

export type TransactionTypeSummary = {
  type: string;
  count: number;
  total_amount: number;
};

export type TransactionAccountSummary = {
  account_id: string;
  account_name: string;
  count: number;
  total_amount: number;
};

export type TransactionDailySummary = {
  date: string;
  count: number;
  net_amount: number;
  credits_in: number;
  credits_out: number;
};

export type TransactionSummary = {
  total_count: number;
  net_amount: number;
  credits_in: number;
  credits_out: number;
  by_type: TransactionTypeSummary[];
  by_account: TransactionAccountSummary[];
  daily: TransactionDailySummary[];
};

export type PaginatedCreditTransactions = {
  items: CreditTransactionDto[];
  pagination: TransactionPagination;
  summary: TransactionSummary;
};

@injectable()
export class CreditHistoryService {
  constructor(
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
  ) {}

  async getTransactions(
    orgId: string,
    filters: TransactionFilters,
  ): Promise<PaginatedCreditTransactions> {
    const { filter, limit, offset } = buildTransactionQuery(orgId, filters);
    const accountNames = await this.loadAccountNameMap(orgId);

    const [total, rows, summary] = await Promise.all([
      CreditTransactionModel.countDocuments(filter),
      CreditTransactionModel.find(filter)
        .sort({ created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean<ICreditTransaction[]>(),
      this.aggregateSummary(orgId, filter, accountNames),
    ]);

    return {
      items: rows.map((row) => this.toDto(row, accountNames)),
      pagination: {
        limit,
        offset,
        total,
        has_more: offset + rows.length < total,
      },
      summary,
    };
  }

  async getSummary(
    orgId: string,
    filters: Omit<TransactionFilters, "limit" | "offset">,
  ): Promise<TransactionSummary> {
    const { filter } = buildTransactionQuery(orgId, filters);
    const accountNames = await this.loadAccountNameMap(orgId);
    return this.aggregateSummary(orgId, filter, accountNames);
  }

  async exportTransactionsCsv(
    orgId: string,
    filters: Omit<TransactionFilters, "limit" | "offset">,
  ): Promise<string> {
    const { filter } = buildTransactionQuery(orgId, {
      ...filters,
      limit: 10_000,
      offset: 0,
    });
    const accountNames = await this.loadAccountNameMap(orgId);
    const rows = await CreditTransactionModel.find(filter)
      .sort({ created_at: -1 })
      .limit(10_000)
      .lean<ICreditTransaction[]>();

    const header = [
      "created_at",
      "type",
      "amount",
      "balance_after",
      "account_id",
      "account_name",
      "reference_type",
      "reference_id",
      "description",
      "created_by",
      "transaction_id",
    ].join(",");

    const lines = rows.map((row) => {
      const dto = this.toDto(row, accountNames);
      return [
        dto.created_at,
        dto.type,
        String(dto.amount),
        String(dto.balance_after),
        dto.account_id ?? "",
        dto.account_name ?? "",
        dto.reference_type,
        dto.reference_id,
        dto.description,
        dto.created_by,
        dto.id,
      ]
        .map((v) => escapeCsvField(v))
        .join(",");
    });

    return [header, ...lines].join("\n");
  }

  private async loadAccountNameMap(orgId: string): Promise<Map<string, string>> {
    const list = await this.accounts.listForOrg(orgId);
    return new Map(list.map((a) => [String(a._id), a.name]));
  }

  private toDto(
    row: ICreditTransaction,
    accountNames: Map<string, string>,
  ): CreditTransactionDto {
    const accountId = row.account_id ? String(row.account_id) : null;
    return {
      id: String(row._id),
      org_id: String(row.org_id),
      account_id: accountId,
      account_name: accountId ? (accountNames.get(accountId) ?? null) : null,
      type: row.type,
      amount: row.amount,
      balance_after: row.balance_after,
      reference_type: row.reference_type,
      reference_id: String(row.reference_id),
      description: row.description,
      created_by: String(row.created_by),
      created_at: row.created_at.toISOString(),
    };
  }

  private async aggregateSummary(
    orgId: string,
    filter: Record<string, unknown>,
    accountNames: Map<string, string>,
  ): Promise<TransactionSummary> {
    const matchStage = { $match: filter };

    const [totals, byType, byAccount, daily] = await Promise.all([
      CreditTransactionModel.aggregate<{
        total_count: number;
        net_amount: number;
        credits_in: number;
        credits_out: number;
      }>([
        matchStage,
        {
          $group: {
            _id: null,
            total_count: { $sum: 1 },
            net_amount: { $sum: "$amount" },
            credits_in: {
              $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] },
            },
            credits_out: {
              $sum: {
                $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
              },
            },
          },
        },
      ]),
      CreditTransactionModel.aggregate<{
        _id: string;
        count: number;
        total_amount: number;
      }>([
        matchStage,
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            total_amount: { $sum: "$amount" },
          },
        },
        { $sort: { count: -1 } },
      ]),
      CreditTransactionModel.aggregate<{
        _id: mongoose.Types.ObjectId;
        count: number;
        total_amount: number;
      }>([
        matchStage,
        { $match: { account_id: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$account_id",
            count: { $sum: 1 },
            total_amount: { $sum: "$amount" },
          },
        },
        { $sort: { total_amount: -1 } },
        { $limit: 50 },
      ]),
      CreditTransactionModel.aggregate<{
        _id: string;
        count: number;
        net_amount: number;
        credits_in: number;
        credits_out: number;
      }>([
        matchStage,
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$created_at" },
            },
            count: { $sum: 1 },
            net_amount: { $sum: "$amount" },
            credits_in: {
              $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] },
            },
            credits_out: {
              $sum: {
                $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 90 },
      ]),
    ]);

    const totalRow = totals[0];

    return {
      total_count: totalRow?.total_count ?? 0,
      net_amount: totalRow?.net_amount ?? 0,
      credits_in: totalRow?.credits_in ?? 0,
      credits_out: totalRow?.credits_out ?? 0,
      by_type: byType.map((row) => ({
        type: row._id,
        count: row.count,
        total_amount: row.total_amount,
      })),
      by_account: byAccount.map((row) => ({
        account_id: String(row._id),
        account_name: accountNames.get(String(row._id)) ?? "Unknown account",
        count: row.count,
        total_amount: row.total_amount,
      })),
      daily: daily.map((row) => ({
        date: row._id,
        count: row.count,
        net_amount: row.net_amount,
        credits_in: row.credits_in,
        credits_out: row.credits_out,
      })),
    };
  }
}
