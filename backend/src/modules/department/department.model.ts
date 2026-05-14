import mongoose, { Schema, type Types } from "mongoose";

/** Team within an account (account- and org-scoped). */
export interface IDepartment {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id: Types.ObjectId;
  name: string;
  description: string;
  manager_id: Types.ObjectId;
  status: "active" | "inactive";
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_deleted: boolean;
}

const departmentSchema = new Schema<IDepartment>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    account_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Account",
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    manager_id: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    created_by: { type: Schema.Types.ObjectId, required: true },
    updated_by: { type: Schema.Types.ObjectId, required: true },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "departments",
  },
);

departmentSchema.index(
  { org_id: 1, account_id: 1, name: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

export const DepartmentModel =
  mongoose.models.Department ??
  mongoose.model<IDepartment>("Department", departmentSchema);
