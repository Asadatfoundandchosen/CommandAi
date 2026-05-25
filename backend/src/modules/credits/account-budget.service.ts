import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import type { IAccount } from "../account/account.model.js";
import { AccountModel } from "../account/account.model.js";
import {
  AccountBudgetModel,
  budgetFieldsFromAccount,
  DEFAULT_BUDGET_WARNING_THRESHOLD,
  type IAccountBudget,
} from "./account-budget.model.js";
import {
  budgetPercentUsed,
  isBudgetWarningActive,
} from "./account-budget.logic.js";
import {
  CreditAllocationService,
  type AllocateToAccountResult,
} from "./credit-allocation.service.js";

export type AccountBudgetView = {
  account_id: string;
  account_name: string;
  allocated: number;
  available: number;
  used: number;
  limit: number;
  warning_threshold: number;
  percent_used: number;
  warning_active: boolean;
  last_usage: string | null;
  updated_at: string;
};

export type SetAccountBudgetLimitInput = {
  orgId: string;
  accountId: string;
  actorUserId: string;
  limit?: number;
  warning_threshold?: number;
};

@injectable()
export class AccountBudgetService {
  constructor(
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.CreditAllocationService)
    private readonly allocation: CreditAllocationService,
  ) {}

  async getBudget(orgId: string, accountId: string): Promise<AccountBudgetView | null> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    const account = await AccountModel.findOne({
      _id: new mongoose.Types.ObjectId(accountId),
      org_id: new mongoose.Types.ObjectId(orgId),
      is_deleted: false,
    }).lean<IAccount>();
    if (!account) {
      return null;
    }
    const doc = await this.syncFromAccount(account);
    return this.toView(account.name, doc);
  }

  async allocateBudget(
    orgId: string,
    accountId: string,
    amount: number,
    createdBy: string,
    description?: string,
  ): Promise<{ budget: AccountBudgetView; allocation: AllocateToAccountResult }> {
    const result = await this.allocation.allocateToAccount({
      orgId,
      accountId,
      amount,
      createdBy,
      description,
    });
    const doc = await this.syncFromAccount(result.account);
    const budget = this.toView(result.account.name, doc);
    return { budget, allocation: result };
  }

  async setLimit(input: SetAccountBudgetLimitInput): Promise<AccountBudgetView | null> {
    await this.hierarchy.assertAccountBelongsToOrg(input.accountId, input.orgId);

    const setDoc: Record<string, unknown> = {
      updated_by: new mongoose.Types.ObjectId(input.actorUserId),
    };
    if (input.limit !== undefined) {
      if (!Number.isInteger(input.limit) || input.limit < 0) {
        throw new Error("limit must be a non-negative integer");
      }
      setDoc["budget.credit_limit"] = input.limit;
    }
    if (input.warning_threshold !== undefined) {
      if (
        !Number.isInteger(input.warning_threshold) ||
        input.warning_threshold < 1 ||
        input.warning_threshold > 100
      ) {
        throw new Error("warning_threshold must be an integer between 1 and 100");
      }
      setDoc["budget.warning_threshold"] = input.warning_threshold;
    }

    const account = await AccountModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(input.accountId),
        org_id: new mongoose.Types.ObjectId(input.orgId),
        is_deleted: false,
      },
      { $set: setDoc },
      { new: true, runValidators: true },
    ).lean<IAccount>();

    if (!account) {
      return null;
    }

    const doc = await this.syncFromAccount(account);
    return this.toView(account.name, doc);
  }

  /** Upsert `account_budgets` from the canonical `accounts` document. */
  async syncFromAccount(account: IAccount): Promise<IAccountBudget> {
    const fields = budgetFieldsFromAccount(account);
    const doc = await AccountBudgetModel.findOneAndUpdate(
      {
        org_id: fields.org_id,
        account_id: fields.account_id,
      },
      { $set: fields },
      { upsert: true, new: true, runValidators: true },
    ).lean<IAccountBudget>();
    if (!doc) {
      throw new Error("Failed to sync account budget");
    }
    return doc;
  }

  async syncByAccountId(orgId: string, accountId: string): Promise<void> {
    const account = await AccountModel.findOne({
      _id: new mongoose.Types.ObjectId(accountId),
      org_id: new mongoose.Types.ObjectId(orgId),
      is_deleted: false,
    }).lean<IAccount>();
    if (account) {
      await this.syncFromAccount(account);
    }
  }

  toView(accountName: string, doc: IAccountBudget): AccountBudgetView {
    const percentUsed = budgetPercentUsed(doc.allocated, doc.used);
    return {
      account_id: String(doc.account_id),
      account_name: accountName,
      allocated: doc.allocated,
      available: doc.available,
      used: doc.used,
      limit: doc.limit,
      warning_threshold: doc.warning_threshold,
      percent_used: Math.round(percentUsed * 10) / 10,
      warning_active: isBudgetWarningActive(
        doc.allocated,
        doc.used,
        doc.warning_threshold,
      ),
      last_usage: doc.last_usage ? doc.last_usage.toISOString() : null,
      updated_at: doc.updated_at.toISOString(),
    };
  }
}

export { DEFAULT_BUDGET_WARNING_THRESHOLD };
