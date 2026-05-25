import mongoose, { Schema, type Types } from "mongoose";

/** Ledger entry types — positive amount adds credits, negative subtracts. */
export type CreditTransactionType =
  | "purchase"
  | "allocation"
  | "consumption"
  | "refund"
  | "expiry";

/** Source document for a credit movement. */
export type CreditReferenceType =
  | "contract"
  | "signal"
  | "action"
  | "hitl"
  | "manual";

/** One balance record per organization (tenant-scoped). */
export interface ICredit {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  balance: number;
  /** Held for in-flight operations; not available until released or consumed. */
  reserved: number;
  lifetime_purchased: number;
  lifetime_used: number;
  last_purchase?: Date;
  last_usage?: Date;
  updated_at: Date;
}

/** Immutable ledger entry for audit and reconciliation. */
export interface ICreditTransaction {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id?: Types.ObjectId;
  type: CreditTransactionType;
  /** Positive for add, negative for subtract. */
  amount: number;
  balance_after: number;
  reference_type: CreditReferenceType;
  reference_id: Types.ObjectId;
  description: string;
  created_by: Types.ObjectId;
  created_at: Date;
}

const creditSchema = new Schema<ICredit>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    balance: { type: Number, required: true, default: 0, min: 0 },
    reserved: { type: Number, required: true, default: 0, min: 0 },
    lifetime_purchased: { type: Number, required: true, default: 0, min: 0 },
    lifetime_used: { type: Number, required: true, default: 0, min: 0 },
    last_purchase: { type: Date },
    last_usage: { type: Date },
  },
  {
    timestamps: { createdAt: false, updatedAt: "updated_at" },
    collection: "credits",
  },
);

creditSchema.index({ org_id: 1 }, { unique: true });

const creditTransactionSchema = new Schema<ICreditTransaction>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    account_id: { type: Schema.Types.ObjectId, ref: "Account" },
    type: {
      type: String,
      enum: ["purchase", "allocation", "consumption", "refund", "expiry"],
      required: true,
    },
    amount: { type: Number, required: true },
    balance_after: { type: Number, required: true, min: 0 },
    reference_type: {
      type: String,
      enum: ["contract", "signal", "action", "hitl", "manual"],
      required: true,
    },
    reference_id: { type: Schema.Types.ObjectId, required: true },
    description: { type: String, required: true, trim: true },
    created_by: { type: Schema.Types.ObjectId, required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    collection: "credit_transactions",
  },
);

creditTransactionSchema.index({ org_id: 1, created_at: -1 });
creditTransactionSchema.index({ org_id: 1, account_id: 1, created_at: -1 });
creditTransactionSchema.index({ org_id: 1, type: 1, created_at: -1 });
creditTransactionSchema.index({
  org_id: 1,
  reference_type: 1,
  reference_id: 1,
});

export const CreditModel =
  mongoose.models.Credit ?? mongoose.model<ICredit>("Credit", creditSchema);

export const CreditTransactionModel =
  mongoose.models.CreditTransaction ??
  mongoose.model<ICreditTransaction>(
    "CreditTransaction",
    creditTransactionSchema,
  );
