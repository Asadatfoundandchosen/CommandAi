import {
  CONNECTOR_ENCRYPTED_FIELDS,
  mongooseFieldEncryptionPlugin,
} from "@common/encryption/mongoose-field-encryption.plugin.js";
import mongoose, { Schema, type Types } from "mongoose";

/** Third-party integration credentials (encrypted JSON at rest). */
export interface IConnector {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  account_id?: Types.ObjectId;
  name: string;
  provider: string;
  /** Plaintext credentials object serialized to JSON in app code (not persisted). */
  credentials?: string;
  credentials_enc?: string;
  created_by: Types.ObjectId;
  created_at: Date;
  updated_by: Types.ObjectId;
  updated_at: Date;
  is_deleted: boolean;
  _version: number;
}

const connectorSchema = new Schema<IConnector>(
  {
    org_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    account_id: { type: Schema.Types.ObjectId, ref: "Account", index: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    credentials: { type: String, select: false },
    credentials_enc: { type: String, select: false },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    is_deleted: { type: Boolean, default: false },
    _version: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "connectors",
  },
);

connectorSchema.index({ org_id: 1, is_deleted: 1, created_at: -1 });

connectorSchema.plugin(mongooseFieldEncryptionPlugin, {
  fields: CONNECTOR_ENCRYPTED_FIELDS,
});

export const ConnectorModel =
  mongoose.models.Connector ??
  mongoose.model<IConnector>("Connector", connectorSchema);
