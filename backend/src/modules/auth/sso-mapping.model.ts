import mongoose, { Schema, type Types } from "mongoose";

import type { UserRole } from "@modules/user/user.model.js";

/** Per-org SSO attribute mapping and JIT defaults (one document per organization). */
export interface ISSOMapping {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  jit_enabled: boolean;
  default_role: UserRole;
  default_account_id: Types.ObjectId;
  default_department_id: Types.ObjectId;
  /** Claim / SAML attribute key for given name (e.g. `given_name`). */
  first_name_attr?: string;
  /** Claim / SAML attribute key for family name (e.g. `family_name`). */
  last_name_attr?: string;
  /** Optional claim used to resolve department by name within default account. */
  department_attr?: string;
  created_at: Date;
  updated_at: Date;
}

const ssoMappingSchema = new Schema<ISSOMapping>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      unique: true,
      index: true,
    },
    jit_enabled: { type: Boolean, default: false },
    default_role: {
      type: String,
      enum: ["org_admin", "account_admin", "dept_manager", "dept_user"],
      default: "dept_user",
    },
    default_account_id: { type: Schema.Types.ObjectId, ref: "Account" },
    default_department_id: { type: Schema.Types.ObjectId, ref: "Department" },
    first_name_attr: { type: String, trim: true },
    last_name_attr: { type: String, trim: true },
    department_attr: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "sso_mappings",
  },
);

export const SsoMappingModel =
  mongoose.models.SsoMapping ??
  mongoose.model<ISSOMapping>("SsoMapping", ssoMappingSchema);
