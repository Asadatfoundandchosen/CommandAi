import mongoose, { Schema, type Types } from "mongoose";

export type ContractStatus = "draft" | "active" | "expired" | "terminated";
export type ContractType = "subscription" | "enterprise" | "trial";
export type BillingPlan = "starter" | "pro" | "enterprise";
export type BillingCycle = "monthly" | "annual";

/** Platform agreement linking 1CommandAI to a client organization. */
export interface IContract {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  contract_number: string;
  status: ContractStatus;
  type: ContractType;
  start_date: Date;
  end_date: Date;
  auto_renew: boolean;
  billing: {
    plan: BillingPlan;
    billing_cycle: BillingCycle;
    amount: number;
    currency: string;
  };
  credits: {
    initial_allocation: number;
    renewal_allocation: number;
  };
  /** Platform-only notes; excluded from org-admin reads (`select: false`). */
  internal_notes?: string;
  /** Renewal automation (daily job): reminders, extension, grace period. */
  renewal_processed?: boolean;
  renewal_reminder_days_sent?: number[];
  renewal_attempts?: number;
  renewal_last_attempt_at?: Date;
  grace_period_end?: Date;
  renewed_at?: Date;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_deleted: boolean;
}

const contractSchema = new Schema<IContract>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    contract_number: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["draft", "active", "expired", "terminated"],
      default: "draft",
    },
    type: {
      type: String,
      enum: ["subscription", "enterprise", "trial"],
      required: true,
    },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    auto_renew: { type: Boolean, default: false },
    billing: {
      plan: {
        type: String,
        enum: ["starter", "pro", "enterprise"],
        required: true,
      },
      billing_cycle: {
        type: String,
        enum: ["monthly", "annual"],
        required: true,
      },
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, required: true, trim: true, uppercase: true },
    },
    credits: {
      initial_allocation: { type: Number, required: true, min: 0 },
      renewal_allocation: { type: Number, required: true, min: 0 },
    },
    internal_notes: { type: String, select: false },
    renewal_processed: { type: Boolean, default: false },
    renewal_reminder_days_sent: { type: [Number], default: [] },
    renewal_attempts: { type: Number, default: 0, min: 0 },
    renewal_last_attempt_at: { type: Date },
    grace_period_end: { type: Date },
    renewed_at: { type: Date },
    created_by: { type: Schema.Types.ObjectId, required: true },
    updated_by: { type: Schema.Types.ObjectId, required: true },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "contracts",
  },
);

contractSchema.index({ contract_number: 1 }, { unique: true });
contractSchema.index({ org_id: 1, created_at: -1 });
contractSchema.index({ org_id: 1, is_deleted: 1 });
contractSchema.index({ org_id: 1, updated_at: -1 });
contractSchema.index({
  status: 1,
  auto_renew: 1,
  end_date: 1,
  renewal_processed: 1,
  is_deleted: 1,
});

export const ContractModel =
  mongoose.models.Contract ?? mongoose.model<IContract>("Contract", contractSchema);
