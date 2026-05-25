import { inject, injectable } from "inversify";
import mongoose, { type ClientSession } from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import type { IAccount } from "../account/account.model.js";
import { AccountModel } from "../account/account.model.js";
import { CreditModel, CreditTransactionModel } from "./credit.model.js";
import { InsufficientCreditsError } from "./credit.service.js";

export class AccountAllocationLimitError extends Error {
  constructor(
    public readonly accountId: string,
    public readonly creditLimit: number,
    public readonly allocatedAfter: number,
  ) {
    super(
      `Account ${accountId} allocation would exceed credit_limit ${creditLimit} (would be ${allocatedAfter})`,
    );
    this.name = "AccountAllocationLimitError";
  }
}

export type AllocateToAccountResult = {
  orgBalance: number;
  account: IAccount;
  transactionId: string;
};

export type AllocateToAccountInput = {
  orgId: string;
  accountId: string;
  amount: number;
  createdBy: string;
  description?: string;
};

@injectable()
export class CreditAllocationService {
  constructor(
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
  ) {}

  /**
   * Moves credits from the org pool into an account budget.
   * Account `allocated_credits` cannot exceed `credit_limit` when limit > 0.
   */
  async allocateToAccount(
    input: AllocateToAccountInput,
  ): Promise<AllocateToAccountResult> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error("Allocation amount must be a positive integer");
    }

    await this.hierarchy.assertAccountBelongsToOrg(input.orgId, input.accountId);

    const session = await mongoose.startSession();
    try {
      let result: AllocateToAccountResult | undefined;
      await session.withTransaction(async () => {
        result = await this.allocateToAccountInSession(input, session);
      });
      if (!result) {
        throw new Error("Credit allocation failed to commit");
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async allocateToAccountInSession(
    input: AllocateToAccountInput,
    session: ClientSession,
  ): Promise<AllocateToAccountResult> {
    const orgObjectId = new mongoose.Types.ObjectId(input.orgId);
    const accountObjectId = new mongoose.Types.ObjectId(input.accountId);

    const account = await AccountModel.findOne({
      _id: accountObjectId,
      org_id: orgObjectId,
      is_deleted: false,
    })
      .session(session)
      .lean<IAccount>();
    if (!account) {
      throw new Error(`Account not found: ${input.accountId}`);
    }
    if (account.status !== "active") {
      throw new Error("Cannot allocate credits to an inactive account");
    }

    const creditLimit = account.budget?.credit_limit ?? 0;
    const currentAllocated = account.budget?.allocated_credits ?? 0;
    const nextAllocated = currentAllocated + input.amount;
    if (creditLimit > 0 && nextAllocated > creditLimit) {
      throw new AccountAllocationLimitError(
        input.accountId,
        creditLimit,
        nextAllocated,
      );
    }

    const orgCredit = await CreditModel.findOneAndUpdate(
      {
        org_id: orgObjectId,
        $expr: {
          $gte: [{ $subtract: ["$balance", "$reserved"] }, input.amount],
        },
      },
      { $inc: { balance: -input.amount } },
      { session, new: true },
    );
    if (!orgCredit) {
      const snapshot = await CreditModel.findOne({ org_id: orgObjectId })
        .session(session)
        .lean();
      const available = snapshot
        ? Math.max(snapshot.balance - snapshot.reserved, 0)
        : 0;
      throw new InsufficientCreditsError(input.orgId, input.amount, available);
    }

    const updatedAccount = await AccountModel.findOneAndUpdate(
      {
        _id: accountObjectId,
        org_id: orgObjectId,
        is_deleted: false,
        ...(creditLimit > 0
          ? {
              $expr: {
                $lte: [
                  { $add: ["$budget.allocated_credits", input.amount] },
                  "$budget.credit_limit",
                ],
              },
            }
          : {}),
      },
      {
        $inc: { "budget.allocated_credits": input.amount },
        $set: { updated_by: new mongoose.Types.ObjectId(input.createdBy) },
      },
      { session, new: true, runValidators: true },
    ).lean<IAccount>();
    if (!updatedAccount) {
      throw new AccountAllocationLimitError(
        input.accountId,
        creditLimit,
        nextAllocated,
      );
    }

    const description =
      input.description?.trim() ||
      `Allocated ${input.amount} credits to account ${account.name}`;

    const [transaction] = await CreditTransactionModel.create(
      [
        {
          org_id: orgObjectId,
          account_id: accountObjectId,
          type: "allocation",
          amount: input.amount,
          balance_after: orgCredit.balance,
          reference_type: "manual",
          reference_id: accountObjectId,
          description,
          created_by: new mongoose.Types.ObjectId(input.createdBy),
        },
      ],
      { session },
    );

    return {
      orgBalance: orgCredit.balance,
      account: updatedAccount,
      transactionId: String(transaction._id),
    };
  }
}
