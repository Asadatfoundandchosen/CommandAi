import mongoose, { Schema, type Types } from "mongoose";

/** Role definition — system (org_id null) or custom (org-scoped). */
export interface IRole {
  _id: Types.ObjectId;
  org_id?: Types.ObjectId | null;
  name: string;
  display_name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  hierarchy_level: number;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

const roleSchema = new Schema<IRole>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, lowercase: true },
    display_name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    permissions: { type: [String], required: true, default: [] },
    is_system: { type: Boolean, required: true, default: false },
    hierarchy_level: { type: Number, required: true, min: 0, max: 100 },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "roles",
  },
);

roleSchema.index(
  { org_id: 1, name: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

roleSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { is_system: true, is_deleted: false, org_id: null },
  },
);

export const RoleModel =
  mongoose.models.Role ?? mongoose.model<IRole>("Role", roleSchema);
