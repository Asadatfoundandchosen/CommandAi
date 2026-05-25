import { injectable } from "inversify";
import mongoose, { type ClientSession } from "mongoose";

import type {
  CreditReferenceType,
  CreditTransactionType,
  ICredit,
  ICreditTransaction,
} from "./credit.model.js";
import { CreditModel, CreditTransactionModel } from "./credit.model.js";

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient credits for org ${orgId}: requested ${requested}, available ${available}`,
    );
    this.name = "InsufficientCreditsError";
  }
}

export class CreditReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditReservationError";
  }
}

export type ApplyCreditTransactionInput = {
  orgId: string;
  accountId?: string;
  type: CreditTransactionType;
  /** Positive adds credits; negative subtracts. */
  amount: number;
  referenceType: CreditReferenceType;
  referenceId: string;
  description: string;
  createdBy: string;
};

export type ListCreditTransactionsOptions = {
  accountId?: string;
  limit?: number;
};

@injectable()
export class CreditService {
  /** Returns the org credit balance, or null if never initialized. */
  async getByOrgId(orgId: string): Promise<ICredit | null> {
    return CreditModel.findOne({
      org_id: new mongoose.Types.ObjectId(orgId),
    }).lean<ICredit>();
  }

  /** Ensures a zero balance record exists for the org (idempotent). */
  async getOrCreate(orgId: string): Promise<ICredit> {
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    const existing = await CreditModel.findOne({ org_id: orgObjectId });
    if (existing) {
      return existing;
    }
    try {
      const created = await CreditModel.create({
        org_id: orgObjectId,
        balance: 0,
        reserved: 0,
        lifetime_purchased: 0,
        lifetime_used: 0,
      });
      return created;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        const doc = await CreditModel.findOne({ org_id: orgObjectId });
        if (doc) {
          return doc;
        }
      }
      throw err;
    }
  }

  /**
   * Atomically updates balance and appends a ledger transaction.
   * Uses a MongoDB multi-document transaction.
   */
  async applyTransaction(
    input: ApplyCreditTransactionInput,
  ): Promise<{ credit: ICredit; transaction: ICreditTransaction }> {
    if (input.amount === 0) {
      throw new Error("Credit transaction amount must be non-zero");
    }
    if (input.amount > 0 && input.type === "consumption") {
      throw new Error("Consumption transactions must have a negative amount");
    }
    if (input.amount < 0 && input.type !== "consumption" && input.type !== "expiry") {
      throw new Error(
        `Transaction type ${input.type} requires a positive amount`,
      );
    }

    const session = await mongoose.startSession();
    try {
      let result: { credit: ICredit; transaction: ICreditTransaction } | undefined;
      await session.withTransaction(async () => {
        result = await this.applyTransactionInSession(input, session);
      });
      if (!result) {
        throw new Error("Credit transaction failed to commit");
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  async addCredits(
    input: Omit<ApplyCreditTransactionInput, "amount"> & { amount: number },
  ): Promise<{ credit: ICredit; transaction: ICreditTransaction }> {
    if (input.amount <= 0) {
      throw new Error("addCredits requires a positive amount");
    }
    return this.applyTransaction({ ...input, amount: input.amount });
  }

  async consumeCredits(
    input: Omit<ApplyCreditTransactionInput, "amount" | "type"> & {
      amount: number;
    },
  ): Promise<{ credit: ICredit; transaction: ICreditTransaction }> {
    if (input.amount <= 0) {
      throw new Error("consumeCredits requires a positive amount");
    }
    return this.applyTransaction({
      ...input,
      type: "consumption",
      amount: -input.amount,
    });
  }

  /** Holds credits for a pending operation without changing balance. */
  async reserveCredits(orgId: string, amount: number): Promise<ICredit> {
    if (amount <= 0) {
      throw new CreditReservationError("reserve amount must be positive");
    }

    const session = await mongoose.startSession();
    try {
      let credit: ICredit | undefined;
      await session.withTransaction(async () => {
        credit = await this.reserveCreditsInSession(orgId, amount, session);
      });
      if (!credit) {
        throw new Error("Credit reservation failed to commit");
      }
      return credit;
    } finally {
      await session.endSession();
    }
  }

  /** Releases a prior reservation without consuming balance. */
  async releaseReserved(orgId: string, amount: number): Promise<ICredit> {
    if (amount <= 0) {
      throw new CreditReservationError("release amount must be positive");
    }

    const session = await mongoose.startSession();
    try {
      let credit: ICredit | undefined;
      await session.withTransaction(async () => {
        const doc = await this.loadCreditForUpdate(orgId, session);
        if (doc.reserved < amount) {
          throw new CreditReservationError(
            `Cannot release ${amount}: only ${doc.reserved} reserved`,
          );
        }
        doc.reserved -= amount;
        await doc.save({ session });
        credit = doc.toObject() as ICredit;
      });
      if (!credit) {
        throw new Error("Credit release failed to commit");
      }
      return credit;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Converts a reservation into a consumption in one transaction:
   * decreases reserved and balance, writes a consumption ledger entry.
   */
  async commitReservedConsumption(
    input: Omit<ApplyCreditTransactionInput, "amount" | "type"> & {
      amount: number;
    },
  ): Promise<{ credit: ICredit; transaction: ICreditTransaction }> {
    if (input.amount <= 0) {
      throw new Error("commitReservedConsumption requires a positive amount");
    }

    const session = await mongoose.startSession();
    try {
      let result: { credit: ICredit; transaction: ICreditTransaction } | undefined;
      await session.withTransaction(async () => {
        const doc = await this.loadCreditForUpdate(input.orgId, session);
        if (doc.reserved < input.amount) {
          throw new CreditReservationError(
            `Cannot commit ${input.amount}: only ${doc.reserved} reserved`,
          );
        }
        if (doc.balance < input.amount) {
          throw new InsufficientCreditsError(
            input.orgId,
            input.amount,
            doc.balance - doc.reserved,
          );
        }

        doc.reserved -= input.amount;
        doc.balance -= input.amount;
        doc.lifetime_used += input.amount;
        doc.last_usage = new Date();

        const [transaction] = await CreditTransactionModel.create(
          [
            {
              org_id: doc.org_id,
              account_id: input.accountId
                ? new mongoose.Types.ObjectId(input.accountId)
                : undefined,
              type: "consumption",
              amount: -input.amount,
              balance_after: doc.balance,
              reference_type: input.referenceType,
              reference_id: new mongoose.Types.ObjectId(input.referenceId),
              description: input.description,
              created_by: new mongoose.Types.ObjectId(input.createdBy),
            },
          ],
          { session },
        );

        await doc.save({ session });
        result = { credit: doc.toObject() as ICredit, transaction };
      });
      if (!result) {
        throw new Error("Reserved consumption failed to commit");
      }
      return result;
    } finally {
      await session.endSession();
    }
  }

  async listTransactions(
    orgId: string,
    options: ListCreditTransactionsOptions = {},
  ): Promise<ICreditTransaction[]> {
    const filter: Record<string, unknown> = {
      org_id: new mongoose.Types.ObjectId(orgId),
    };
    if (options.accountId) {
      filter.account_id = new mongoose.Types.ObjectId(options.accountId);
    }
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return CreditTransactionModel.find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .lean<ICreditTransaction[]>();
  }

  private async applyTransactionInSession(
    input: ApplyCreditTransactionInput,
    session: ClientSession,
  ): Promise<{ credit: ICredit; transaction: ICreditTransaction }> {
    const doc = await this.loadCreditForUpdate(input.orgId, session);
    const available = doc.balance - doc.reserved;

    if (input.amount < 0) {
      const debit = Math.abs(input.amount);
      if (available < debit) {
        throw new InsufficientCreditsError(input.orgId, debit, available);
      }
      doc.lifetime_used += debit;
      doc.last_usage = new Date();
    } else {
      if (input.type === "purchase" || input.type === "allocation") {
        doc.lifetime_purchased += input.amount;
      }
      if (
        input.type === "purchase" ||
        input.type === "allocation" ||
        input.type === "refund"
      ) {
        doc.last_purchase = new Date();
      }
    }

    doc.balance += input.amount;

    const [transaction] = await CreditTransactionModel.create(
      [
        {
          org_id: doc.org_id,
          account_id: input.accountId
            ? new mongoose.Types.ObjectId(input.accountId)
            : undefined,
          type: input.type,
          amount: input.amount,
          balance_after: doc.balance,
          reference_type: input.referenceType,
          reference_id: new mongoose.Types.ObjectId(input.referenceId),
          description: input.description,
          created_by: new mongoose.Types.ObjectId(input.createdBy),
        },
      ],
      { session },
    );

    await doc.save({ session });
    return { credit: doc.toObject() as ICredit, transaction };
  }

  private async reserveCreditsInSession(
    orgId: string,
    amount: number,
    session: ClientSession,
  ): Promise<ICredit> {
    const doc = await this.loadCreditForUpdate(orgId, session);
    const available = doc.balance - doc.reserved;
    if (available < amount) {
      throw new InsufficientCreditsError(orgId, amount, available);
    }
    doc.reserved += amount;
    await doc.save({ session });
    return doc.toObject() as ICredit;
  }

  private async loadCreditForUpdate(
    orgId: string,
    session: ClientSession,
  ): Promise<mongoose.Document<unknown, object, ICredit> & ICredit> {
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    let doc = await CreditModel.findOne({ org_id: orgObjectId }).session(session);
    if (!doc) {
      const [created] = await CreditModel.create(
        [
          {
            org_id: orgObjectId,
            balance: 0,
            reserved: 0,
            lifetime_purchased: 0,
            lifetime_used: 0,
          },
        ],
        { session },
      );
      doc = created;
    }
    return doc;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 11_000
  );
}
