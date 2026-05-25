import {
  mongooseFieldEncryptionPlugin,
  USER_ENCRYPTED_FIELDS,
} from "@common/encryption/mongoose-field-encryption.plugin.js";
import mongoose, { Schema, type Types } from "mongoose";

export type UserRole =
  | "org_admin"
  | "account_admin"
  | "dept_manager"
  | "dept_user";

export type UserStatus = "active" | "inactive" | "pending";

/** Single-use MFA recovery code (Argon2 hash at rest). */
export type UserMfaBackupCode = {
  hash: string;
  used: boolean;
};

/** TOTP MFA state (Google Authenticator compatible). */
export type UserMfa = {
  totp_secret_enc?: string;
  totp_pending?: boolean;
  /** Argon2-hashed single-use backup codes. */
  backup_codes?: UserMfaBackupCode[];
  /** @deprecated Legacy SHA-256 hashes; cleared on regenerate. */
  backup_code_hashes?: string[];
  sms_enabled?: boolean;
};

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
  mfa?: UserMfa;
  /** E.164 phone for SMS MFA (decrypted in memory after read). */
  phone_number?: string;
  phone_number_enc?: string;
  phone_number_search?: string;
  ssn?: string;
  ssn_enc?: string;
  ssn_search?: string;
  /** Set when login detects a weak password or legacy hash — user must update password. */
  password_change_required: boolean;
  /** SCIM / IdP external identifier for provisioning. */
  scim_external_id?: string;
  /** SSO IdP subject / NameID for federated sign-in. */
  sso_id?: string;
  /** SSO protocol or IdP label (saml, oidc, google, microsoft, …). */
  sso_provider?: string;
  /** Time-limited password login when org enforces SSO. */
  emergency_access_expires_at?: Date;
  emergency_access_granted_by?: Types.ObjectId;
  emergency_access_granted_at?: Date;
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
    mfa: {
      totp_secret_enc: { type: String, select: false },
      totp_pending: { type: Boolean, default: false },
      backup_codes: {
        type: [
          {
            hash: { type: String, required: true },
            used: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
      backup_code_hashes: { type: [String], default: [] },
      sms_enabled: { type: Boolean, default: false },
    },
    phone_number: { type: String, trim: true, select: false },
    phone_number_enc: { type: String, select: false },
    phone_number_search: { type: String, select: false },
    ssn: { type: String, select: false },
    ssn_enc: { type: String, select: false },
    ssn_search: { type: String, select: false },
    password_change_required: { type: Boolean, default: false },
    scim_external_id: { type: String, trim: true, sparse: true },
    sso_id: { type: String, trim: true, sparse: true },
    sso_provider: { type: String, trim: true },
    emergency_access_expires_at: { type: Date },
    emergency_access_granted_by: { type: Schema.Types.ObjectId },
    emergency_access_granted_at: { type: Date },
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

userSchema.index({ org_id: 1, sso_id: 1 }, { sparse: true });
userSchema.index({ org_id: 1, scim_external_id: 1 }, { sparse: true });

userSchema.index(
  { org_id: 1, email: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);
userSchema.index({ org_id: 1, phone_number_search: 1 }, { sparse: true });
userSchema.index({ org_id: 1, ssn_search: 1 }, { sparse: true });

userSchema.plugin(mongooseFieldEncryptionPlugin, {
  fields: USER_ENCRYPTED_FIELDS,
});

export const UserModel =
  mongoose.models.User ?? mongoose.model<IUser>("User", userSchema);
