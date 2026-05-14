import mongoose, { Schema, type Types } from "mongoose";

export type UserRole =
  | "org_admin"
  | "account_admin"
  | "dept_manager"
  | "dept_user";

export type UserStatus = "active" | "inactive" | "pending";

/** Team member under Department → Account → Organization. */
export interface IUser {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id: Types.ObjectId;
  department_id: Types.ObjectId;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  mfa_enabled: boolean;
  last_login: Date | null;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_deleted: boolean;
}

/** Document returned from API / persistence reads (`password_hash` never exposed). */
export type IUserPublic = Omit<IUser, "password_hash">;

const userSchema = new Schema<IUser>(
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
    department_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Department",
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true, select: false },
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["org_admin", "account_admin", "dept_manager", "dept_user"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "pending",
    },
    mfa_enabled: { type: Boolean, default: false },
    last_login: { type: Date, default: null },
    created_by: { type: Schema.Types.ObjectId, required: true },
    updated_by: { type: Schema.Types.ObjectId, required: true },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "users",
  },
);

userSchema.index(
  { org_id: 1, email: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

export const UserModel =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
