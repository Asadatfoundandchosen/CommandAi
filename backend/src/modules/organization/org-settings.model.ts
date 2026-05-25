import mongoose, { Schema, type Types } from "mongoose";

import type { CreditRateCard } from "../../config/credit-rates.js";

/** Per-org key/value settings (e.g. enterprise `credit_rates`). */
export interface IOrgSetting {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  key: string;
  value: CreditRateCard | Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const orgSettingSchema = new Schema<IOrgSetting>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    key: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "org_settings",
  },
);

orgSettingSchema.index({ org_id: 1, key: 1 }, { unique: true });

export const OrgSettingsModel =
  mongoose.models.OrgSetting ??
  mongoose.model<IOrgSetting>("OrgSetting", orgSettingSchema);
