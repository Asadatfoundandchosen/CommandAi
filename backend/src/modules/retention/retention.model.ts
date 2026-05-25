import mongoose, { Schema, type Types } from "mongoose";

/** Per-org audit log retention configuration (compliance). */
export interface IRetentionPolicy {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  /** Minimum 365 days (enforced in validation). */
  audit_retention_days: number;
  /** When true, export expired logs to S3 before deletion. */
  archive_before_delete: boolean;
  /** S3 key prefix, e.g. `audit-archives/<orgId>/`. */
  archive_location: string;
  created_at: Date;
  updated_at: Date;
}

const retentionPolicySchema = new Schema<IRetentionPolicy>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      unique: true,
      index: true,
    },
    audit_retention_days: {
      type: Number,
      required: true,
      min: 365,
    },
    archive_before_delete: { type: Boolean, default: true },
    archive_location: { type: String, required: true, trim: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "retention_policies",
  },
);

export const RetentionPolicyModel =
  mongoose.models.RetentionPolicy ??
  mongoose.model<IRetentionPolicy>("RetentionPolicy", retentionPolicySchema);

export type RetentionRunStatus = "completed" | "failed" | "partial";

/** Immutable record of a retention sweep for compliance reporting. */
export interface IRetentionRun {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  started_at: Date;
  completed_at?: Date;
  cutoff: Date;
  audit_retention_days: number;
  archived_count: number;
  deleted_mongo_count: number;
  deleted_opensearch_count: number;
  archive_s3_keys: string[];
  status: RetentionRunStatus;
  error_message?: string;
}

const retentionRunSchema = new Schema<IRetentionRun>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    started_at: { type: Date, required: true, default: () => new Date() },
    completed_at: { type: Date },
    cutoff: { type: Date, required: true },
    audit_retention_days: { type: Number, required: true },
    archived_count: { type: Number, default: 0 },
    deleted_mongo_count: { type: Number, default: 0 },
    deleted_opensearch_count: { type: Number, default: 0 },
    archive_s3_keys: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["completed", "failed", "partial"],
      required: true,
    },
    error_message: { type: String, trim: true },
  },
  {
    collection: "retention_runs",
    timestamps: false,
  },
);

retentionRunSchema.index({ org_id: 1, started_at: -1 });

export const RetentionRunModel =
  mongoose.models.RetentionRun ??
  mongoose.model<IRetentionRun>("RetentionRun", retentionRunSchema);
