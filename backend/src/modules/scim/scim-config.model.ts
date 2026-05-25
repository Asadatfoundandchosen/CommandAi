import mongoose, { Schema, type Types } from "mongoose";

import type { UserRole } from "@modules/user/user.model.js";

/** Per-org SCIM 2.0 provisioning configuration. */
export interface IScimConfig {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  enabled: boolean;
  bearer_token_hash: string;
  default_role: UserRole;
  default_account_id: Types.ObjectId;
  default_department_id: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
}

const scimConfigSchema = new Schema<IScimConfig>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: false },
    bearer_token_hash: { type: String, required: true, select: false },
    default_role: {
      type: String,
      enum: ["org_admin", "account_admin", "dept_manager", "dept_user"],
      default: "dept_user",
    },
    default_account_id: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    default_department_id: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "scim_configs",
  },
);

scimConfigSchema.index({ bearer_token_hash: 1 }, { unique: true, sparse: true });

export const ScimConfigModel =
  mongoose.models.ScimConfig ??
  mongoose.model<IScimConfig>("ScimConfig", scimConfigSchema);
