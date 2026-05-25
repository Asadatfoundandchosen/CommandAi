import mongoose, { Schema, type Types } from "mongoose";

export type AuditActorType = "user" | "api_key" | "system" | "agent";

export type AuditActor = {
  type: AuditActorType;
  id: Types.ObjectId;
  email?: string;
  ip_address: string;
  user_agent: string;
};

export type AuditResource = {
  type: string;
  id: Types.ObjectId;
  name?: string;
};

export type FieldChange = { from: unknown; to: unknown };

export type FieldChangeMap = Record<string, FieldChange>;

export type AuditChanges = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** Field-level `{ from, to }` diffs for updates. */
  diff?: FieldChangeMap;
};

/** Structured audit event — who, what, when, where; extensible metadata. */
export interface IAuditLog {
  _id: Types.ObjectId;
  timestamp: Date;
  org_id: Types.ObjectId;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  changes?: AuditChanges;
  metadata?: Record<string, unknown>;
  request_id: string;
  trace_id?: string;
  /** SHA-256 integrity checksum over timestamp, action, actor, resource. */
  checksum?: string;
}

const auditActorSchema = new Schema<AuditActor>(
  {
    type: {
      type: String,
      enum: ["user", "api_key", "system", "agent"],
      required: true,
    },
    id: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, trim: true },
    ip_address: { type: String, required: true },
    user_agent: { type: String, required: true },
  },
  { _id: false },
);

const auditResourceSchema = new Schema<AuditResource>(
  {
    type: { type: String, required: true, trim: true },
    id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, trim: true },
  },
  { _id: false },
);

const auditChangesSchema = new Schema<AuditChanges>(
  {
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const auditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    actor: { type: auditActorSchema, required: true },
    action: { type: String, required: true, trim: true, index: true },
    resource: { type: auditResourceSchema, required: true },
    changes: { type: auditChangesSchema },
    metadata: { type: Schema.Types.Mixed },
    request_id: { type: String, required: true, index: true },
    trace_id: { type: String, index: true },
    checksum: { type: String, trim: true, index: true },
  },
  {
    collection: "audit_logs",
    timestamps: false,
  },
);

auditLogSchema.index({ org_id: 1, timestamp: -1 });
auditLogSchema.index({ org_id: 1, "resource.type": 1, timestamp: -1 });
auditLogSchema.index({ org_id: 1, "resource.type": 1, "resource.id": 1, timestamp: -1 });
auditLogSchema.index({ org_id: 1, "actor.id": 1, timestamp: -1 });

export const AuditLogModel =
  mongoose.models.AuditLog ??
  mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

/** Block in-place updates and deletes — audit_logs are append-only. */
auditLogSchema.pre("save", function auditImmutableSave() {
  if (!this.isNew) {
    throw new Error("Audit log documents are immutable");
  }
});

for (const hook of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  auditLogSchema.pre(hook, function auditImmutableMutation() {
    throw new Error("Audit log documents are immutable");
  });
}
