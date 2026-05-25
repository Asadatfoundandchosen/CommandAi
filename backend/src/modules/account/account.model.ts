import mongoose, { Schema, type Types } from "mongoose";

/** Business unit within an organization (tenant-scoped). */
export interface IAccount {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  name: string;
  status: "active" | "inactive";
  budget: {
    credit_limit: number;
    allocated_credits: number;
    used_credits: number;
    /** Warn when usage reaches this percent of allocated (1–100). */
    warning_threshold: number;
    /** Last credit consumption timestamp. */
    last_usage_at?: Date | null;
  };
  settings: Record<string, unknown>;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_deleted: boolean;
}

const accountSchema = new Schema<IAccount>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    budget: {
      credit_limit: { type: Number, default: 0 },
      allocated_credits: { type: Number, default: 0 },
      used_credits: { type: Number, default: 0 },
      warning_threshold: { type: Number, default: 80, min: 1, max: 100 },
      last_usage_at: { type: Date, default: null },
    },
    settings: { type: Schema.Types.Mixed, default: {} },
    created_by: { type: Schema.Types.ObjectId, required: true },
    updated_by: { type: Schema.Types.ObjectId, required: true },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "accounts",
  },
);

accountSchema.index(
  { org_id: 1, name: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

export const AccountModel =
  mongoose.models.Account ?? mongoose.model<IAccount>("Account", accountSchema);
