import mongoose, { Schema, type Types } from "mongoose";

/** Programmatic API credential scoped to org (optional account). */
export interface IAPIKey {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id?: Types.ObjectId | null;
  name: string;
  /** First 12 characters of the secret (`1cmd_` + hex) for identification in UI. */
  key_prefix: string;
  /**
   * SHA-256 hex of the full secret — one-way hash only (plaintext API key is never stored).
   * Field-level encryption applies to reversible secrets (SSO, connectors, PII), not API keys.
   */
  key_hash: string;
  permissions: string[];
  rate_limit: number;
  expires_at?: Date | null;
  last_used?: Date | null;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_active: boolean;
  is_deleted: boolean;
  _version: number;
}

const apiKeySchema = new Schema<IAPIKey>(
  {
    org_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    account_id: { type: Schema.Types.ObjectId, ref: "Account", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 128 },
    key_prefix: { type: String, required: true, trim: true, maxlength: 16 },
    key_hash: { type: String, required: true },
    permissions: { type: [String], required: true, default: [] },
    rate_limit: { type: Number, required: true, min: 1, max: 1_000_000, default: 1000 },
    expires_at: { type: Date, default: null },
    last_used: { type: Date, default: null },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    is_active: { type: Boolean, required: true, default: true },
    is_deleted: { type: Boolean, default: false },
    _version: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "api_keys",
  },
);

apiKeySchema.index({ org_id: 1, created_at: -1 });
apiKeySchema.index({ org_id: 1, is_deleted: 1 });
apiKeySchema.index(
  { key_hash: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

export const APIKeyModel =
  mongoose.models.APIKey ?? mongoose.model<IAPIKey>("APIKey", apiKeySchema);
