import mongoose, { Schema, type Types } from "mongoose";

import type { UserRole } from "@modules/user/user.model.js";

export type GroupRoleMappingEntry = {
  idp_group: string;
  role: UserRole;
  account_id?: Types.ObjectId;
  department_id?: Types.ObjectId;
};

/** Per-org IdP group → application role mappings (synced on each SSO login). */
export interface IGroupMapping {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  enabled: boolean;
  /** Role when user is not in any mapped IdP group. */
  fallback_role: UserRole;
  mappings: GroupRoleMappingEntry[];
  created_at: Date;
  updated_at: Date;
}

const groupRoleMappingEntrySchema = new Schema<GroupRoleMappingEntry>(
  {
    idp_group: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["org_admin", "account_admin", "dept_manager", "dept_user"],
      required: true,
    },
    account_id: { type: Schema.Types.ObjectId, ref: "Account" },
    department_id: { type: Schema.Types.ObjectId, ref: "Department" },
  },
  { _id: false },
);

const groupMappingSchema = new Schema<IGroupMapping>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: false },
    fallback_role: {
      type: String,
      enum: ["org_admin", "account_admin", "dept_manager", "dept_user"],
      default: "dept_user",
    },
    mappings: { type: [groupRoleMappingEntrySchema], default: [] },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "group_mappings",
  },
);

export const GroupMappingModel =
  mongoose.models.GroupMapping ??
  mongoose.model<IGroupMapping>("GroupMapping", groupMappingSchema);
