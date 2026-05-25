import mongoose, { Schema, type Types } from "mongoose";

export type MfaRequiredFor = "all" | "admins" | "none";

export type MfaAllowedMethod = "totp" | "sms" | "email" | "webauthn";

/** Org-level MFA enforcement policy (one document per organization). */
export interface IMFAPolicy {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  enabled: boolean;
  required_for: MfaRequiredFor;
  grace_period_days: number;
  allowed_methods: MfaAllowedMethod[];
  enforcement_date: Date;
  created_at: Date;
  updated_at: Date;
}

const mfaPolicySchema = new Schema<IMFAPolicy>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: false },
    required_for: {
      type: String,
      enum: ["all", "admins", "none"],
      default: "none",
    },
    grace_period_days: { type: Number, default: 14, min: 0, max: 90 },
    allowed_methods: {
      type: [String],
      enum: ["totp", "sms", "email", "webauthn"],
      default: ["totp", "sms"],
    },
    enforcement_date: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "mfa_policies",
  },
);

export const MfaPolicyModel =
  mongoose.models.MfaPolicy ??
  mongoose.model<IMFAPolicy>("MfaPolicy", mfaPolicySchema);
