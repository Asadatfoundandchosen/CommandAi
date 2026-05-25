import { inject, injectable } from "inversify";
import mongoose, { type ClientSession } from "mongoose";

import {
  insertCreditUsage,
  isTimescaleConnected,
} from "../../infrastructure/database/timescale.js";
import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import type { IAccount } from "../account/account.model.js";
import { AccountModel } from "../account/account.model.js";
import type { CreditReferenceType } from "./credit.model.js";
import { CreditTransactionModel } from "./credit.model.js";
import { consumptionCreditsForType } from "../../config/credit-rates.js";
import { AccountBudgetService } from "./account-budget.service.js";
import { CreditAlertService } from "./credit-alert.service.js";
import { CreditRatesService } from "./credit-rates.service.js";
import {
  CREDIT_CONSUMPTION_SYSTEM_ACTOR,
  type ConsumptionResourceType,
  isConsumptionResourceType,
  referenceTypeForConsumption,
} from "./credit-consumption.constants.js";

export class AccountInsufficientCreditsError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly accountId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("Account has insufficient credits");
    this.name = "AccountInsufficientCreditsError";
  }
}

export type ConsumeCreditsInput = {
  orgId: string;
  accountId: string;
  type: ConsumptionResourceType | string;
  referenceId: string;
  createdBy?: string;
  description?: string;
};

export type ConsumeCreditsResult = {
  consumed: number;
  remaining: number;
  transactionId: string;
  account: IAccount;
};

@injectable()
export class CreditConsumptionService {
  constructor(
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.CreditRatesService)
    private readonly rateCard: CreditRatesService,
    @inject(TYPES.CreditAlertService)
    private readonly creditAlerts: CreditAlertService,
    @inject(TYPES.AccountBudgetService)
    private readonly accountBudgets: AccountBudgetService,
  ) {}

  /**
   * Deducts credits from an account budget for a signal, action, or HITL event.
   * Uses account `allocated_credits - used_credits` as available balance.
   */
  async consumeCredits(input: ConsumeCreditsInput): Promise<ConsumeCreditsResult> {
    if (!isConsumptionResourceType(input.type)) {
      throw new Error(
        `Invalid consumption type: ${input.type}. Expected signal, action, or hitl`,
      );
    }
    if (!/^[a-fA-F0-9]{24}$/.test(input.referenceId)) {
      throw new Error("referenceId must be a 24-char hex ObjectId");
    }

    const resourceType = input.type;
    const { rates } = await this.rateCard.getRatesForOrg(input.orgId);
    const amount = consumptionCreditsForType(rates, resourceType);
    if (amount <= 0) {
      throw new Error(`No credit rate configured for ${resourceType}`);
    }
    await this.hierarchy.assertAccountBelongsToOrg(input.accountId, input.orgId);

    const session = await mongoose.startSession();
    try {
      let result: ConsumeCreditsResult | undefined;
      await session.withTransaction(async () => {
        result = await this.consumeCreditsInSession(
          {
            orgId: input.orgId,
            accountId: input.accountId,
            type: resourceType,
            referenceId: input.referenceId,
            createdBy: input.createdBy,
            description: input.description,
            amount,
            referenceType: referenceTypeForConsumption(resourceType),
          },
          session,
        );
      });
      if (!result) {
        throw new Error("Credit consumption failed to commit");
      }

      void this.recordTimescaleUsage(input.orgId, input.accountId, amount, {
        type: resourceType,
        reference_id: input.referenceId,
      });

      void this.creditAlerts.checkAndAlert(input.orgId).catch((err: unknown) => {
        process.stderr.write(
          `[credit-alert] check failed org=${input.orgId}: ${String(err)}\n`,
        );
      });

      void this.accountBudgets
        .syncByAccountId(input.orgId, input.accountId)
        .catch((err: unknown) => {
          process.stderr.write(
            `[account-budget] sync failed org=${input.orgId} account=${input.accountId}: ${String(err)}\n`,
          );
        });

      return result;
    } finally {
      await session.endSession();
    }
  }

  private async consumeCreditsInSession(
    input: {
      orgId: string;
      accountId: string;
      type: ConsumptionResourceType;
      referenceId: string;
      createdBy?: string;
      description?: string;
      amount: number;
      referenceType: CreditReferenceType;
    },
    session: ClientSession,
  ): Promise<ConsumeCreditsResult> {
    const orgObjectId = new mongoose.Types.ObjectId(input.orgId);
    const accountObjectId = new mongoose.Types.ObjectId(input.accountId);
    const referenceObjectId = new mongoose.Types.ObjectId(input.referenceId);
    const createdBy = new mongoose.Types.ObjectId(
      input.createdBy && /^[a-fA-F0-9]{24}$/.test(input.createdBy)
        ? input.createdBy
        : CREDIT_CONSUMPTION_SYSTEM_ACTOR,
    );

    const updatedAccount = await AccountModel.findOneAndUpdate(
      {
        _id: accountObjectId,
        org_id: orgObjectId,
        is_deleted: false,
        status: "active",
        $expr: {
          $gte: [
            {
              $subtract: ["$budget.allocated_credits", "$budget.used_credits"],
            },
            input.amount,
          ],
        },
      },
      {
        $inc: { "budget.used_credits": input.amount },
        $set: {
          updated_by: createdBy,
          "budget.last_usage_at": new Date(),
        },
      },
      { session, new: true, runValidators: true },
    ).lean<IAccount>();

    if (!updatedAccount) {
      const snapshot = await AccountModel.findOne({
        _id: accountObjectId,
        org_id: orgObjectId,
        is_deleted: false,
      })
        .session(session)
        .lean<IAccount>();
      const allocated = snapshot?.budget?.allocated_credits ?? 0;
      const used = snapshot?.budget?.used_credits ?? 0;
      const available = Math.max(allocated - used, 0);
      throw new AccountInsufficientCreditsError(
        input.orgId,
        input.accountId,
        input.amount,
        available,
      );
    }

    const remaining = Math.max(
      updatedAccount.budget.allocated_credits - updatedAccount.budget.used_credits,
      0,
    );

    const description =
      input.description?.trim() ||
      `Consumed ${input.amount} credits for ${input.type} ${input.referenceId}`;

    const [transaction] = await CreditTransactionModel.create(
      [
        {
          org_id: orgObjectId,
          account_id: accountObjectId,
          type: "consumption",
          amount: -input.amount,
          balance_after: remaining,
          reference_type: input.referenceType,
          reference_id: referenceObjectId,
          description,
          created_by: createdBy,
        },
      ],
      { session },
    );

    return {
      consumed: input.amount,
      remaining,
      transactionId: String(transaction._id),
      account: updatedAccount,
    };
  }

  private async recordTimescaleUsage(
    orgId: string,
    accountId: string,
    credits: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!isTimescaleConnected()) {
      return;
    }
    try {
      await insertCreditUsage([
        {
          time: new Date(),
          orgId,
          accountId,
          credits: String(credits),
          metadata,
        },
      ]);
    } catch (err) {
      process.stderr.write(
        `[credit-consumption] Timescale credit_usage insert failed: ${String(err)}\n`,
      );
    }
  }
}
