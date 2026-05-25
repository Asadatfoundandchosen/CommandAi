import { getAuditContext } from "@common/audit/audit-context.js";
import {
  isSoftDelete,
  resolveCrudAction,
  resolveOrgId,
  resolveResourceName,
} from "@common/audit/audit-crud.helpers.js";
import { sanitizeAuditSnapshot } from "@common/audit/audit-sanitize.js";
import { buildAuditChanges } from "@common/audit/track-changes.js";
import { getAuditService } from "@common/audit/audit.registry.js";
import type { AuditEvent } from "@modules/audit/audit.types.js";
import { Types, type Document, type Model, type Query, type Schema } from "mongoose";

export const AUDIT_INTERNAL_OPTION = "_auditInternal" as const;
export const AUDIT_PLUGIN_FLAG = "_auditPluginApplied" as const;

type QueryWithAuditState = Query<unknown, unknown> & {
  _auditBefore?: Record<string, unknown> | null;
  _auditBulkMeta?: Record<string, unknown>;
};

type DocWithAuditLocals = Document & {
  $locals: {
    auditSkip?: boolean;
    auditBefore?: Record<string, unknown> | null;
    auditIsCreate?: boolean;
  };
};

function isAuditInternal(query: Query<unknown, unknown>): boolean {
  const opts = query.getOptions() as Record<string, unknown>;
  return opts[AUDIT_INTERNAL_OPTION] === true;
}

function internalFindOne<T>(
  query: Query<T, unknown>,
): Query<T, unknown> {
  return query.setOptions({ [AUDIT_INTERNAL_OPTION]: true });
}

function shouldSkipDoc(doc: DocWithAuditLocals | null | undefined): boolean {
  return doc?.$locals?.auditSkip === true;
}

type SchemaWithQueryHooks = Schema & {
  pre(hook: string, fn: (...args: unknown[]) => unknown): Schema;
  post(hook: string, fn: (...args: unknown[]) => unknown): Schema;
};

function queryPre(
  schema: Schema,
  hook: string,
  fn: (this: QueryWithAuditState, ...args: unknown[]) => unknown,
): void {
  (schema as SchemaWithQueryHooks).pre(hook, fn as (...args: unknown[]) => unknown);
}

function queryPost(
  schema: Schema,
  hook: string,
  fn: (this: QueryWithAuditState, ...args: unknown[]) => unknown,
): void {
  (schema as SchemaWithQueryHooks).post(hook, fn as (...args: unknown[]) => unknown);
}

function modelPost(
  schema: Schema,
  hook: string,
  fn: (...args: unknown[]) => unknown,
): void {
  (schema as SchemaWithQueryHooks).post(hook, fn);
}

function toResourceId(value: unknown): Types.ObjectId | null {
  if (value == null) {
    return null;
  }
  try {
    return new Types.ObjectId(String(value));
  } catch {
    return null;
  }
}

async function emitAudit(partial: Omit<AuditEvent, "org_id"> & { org_id: Types.ObjectId }): Promise<void> {
  const audit = getAuditService();
  if (!audit) {
    return;
  }
  try {
    await audit.log(partial);
  } catch (e) {
    process.stderr.write(`[audit-plugin] log failed: ${String(e)}\n`);
  }
}

async function logDocumentEvent(
  collectionName: string,
  operation: "created" | "updated" | "deleted" | "read",
  doc: Record<string, unknown> | null | undefined,
  changes?: AuditEvent["changes"],
  metadata?: Record<string, unknown>,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): Promise<void> {
  if (!doc) {
    return;
  }
  const ctx = getAuditContext();
  const orgId = resolveOrgId(doc, collectionName, ctx?.req?.tenantId ?? ctx?.req?.user?.org_id);
  if (!orgId) {
    return;
  }
  const resourceId = toResourceId(doc._id);
  if (!resourceId) {
    return;
  }
  const action = resolveCrudAction(collectionName, operation, before, after);
  await emitAudit({
    org_id: orgId,
    action,
    resource: {
      type: collectionName,
      id: resourceId,
      name: resolveResourceName(doc),
    },
    ...(changes !== undefined ? { changes } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

/**
 * Mongoose plugin — logs create, read, update, delete, and bulk operations to `AuditService`.
 * Skips `audit_logs` and internal queries marked with `{ _auditInternal: true }`.
 */
export function auditPlugin(schema: Schema): void {
  if ((schema as Schema & { [AUDIT_PLUGIN_FLAG]?: boolean })[AUDIT_PLUGIN_FLAG]) {
    return;
  }
  (schema as Schema & { [AUDIT_PLUGIN_FLAG]?: boolean })[AUDIT_PLUGIN_FLAG] = true;

  const collectionName =
    (schema.get("collection") as string | undefined) ??
    schema.options.collection ??
    "unknown";

  if (collectionName === "audit_logs") {
    return;
  }

  schema.pre("save", async function (this: DocWithAuditLocals) {
    if (shouldSkipDoc(this)) {
      return;
    }
    this.$locals.auditIsCreate = this.isNew;
    if (!this.isNew && this._id) {
      const ModelCtor = this.constructor as Model<unknown>;
      const before = await internalFindOne(
        ModelCtor.findById(this._id),
      ).lean<Record<string, unknown> | null>();
      this.$locals.auditBefore = before;
    }
  });

  schema.post("save", async function (this: DocWithAuditLocals, doc: DocWithAuditLocals) {
    if (shouldSkipDoc(doc)) {
      return;
    }
    const snapshot = sanitizeAuditSnapshot(doc.toObject());
    if (!snapshot) {
      return;
    }
    if (this.$locals.auditIsCreate) {
      await logDocumentEvent(collectionName, "created", snapshot, buildAuditChanges(null, snapshot));
      return;
    }
    const before = this.$locals.auditBefore;
    const after = snapshot;
    const operation = isSoftDelete(
      sanitizeAuditSnapshot(before),
      after,
    )
      ? "deleted"
      : "updated";
    await logDocumentEvent(
      collectionName,
      operation,
      after,
      buildAuditChanges(before, after),
      undefined,
      before,
      after,
    );
  });

  queryPre(schema, "findOneAndUpdate", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    const before = await internalFindOne(
      this.model.findOne(this.getQuery()),
    ).lean<Record<string, unknown> | null>();
    this._auditBefore = before;
  });

  queryPost(schema, "findOneAndUpdate", async function (this: QueryWithAuditState, doc: unknown) {
    const resultDoc = doc as Document | null;
    if (isAuditInternal(this) || !resultDoc || shouldSkipDoc(resultDoc as DocWithAuditLocals)) {
      return;
    }
    const before = this._auditBefore;
    const afterRaw = resultDoc.toObject();
    const after = sanitizeAuditSnapshot(afterRaw);
    if (!after) {
      return;
    }
    const operation = isSoftDelete(
      sanitizeAuditSnapshot(before),
      after,
    )
      ? "deleted"
      : "updated";
    await logDocumentEvent(
      collectionName,
      operation,
      after,
      buildAuditChanges(before, afterRaw),
      undefined,
      before,
      afterRaw,
    );
  });

  queryPre(schema, "updateOne", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    this._auditBefore = await internalFindOne(
      this.model.findOne(this.getQuery()),
    ).lean<Record<string, unknown> | null>();
  });

  queryPost(schema, "updateOne", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    const afterRaw = await internalFindOne(
      this.model.findOne(this.getQuery()),
    ).lean<Record<string, unknown> | null>();
    const before = this._auditBefore;
    const afterSanitized = sanitizeAuditSnapshot(afterRaw);
    if (!afterSanitized) {
      return;
    }
    const operation = isSoftDelete(
      sanitizeAuditSnapshot(before),
      afterSanitized,
    )
      ? "deleted"
      : "updated";
    await logDocumentEvent(
      collectionName,
      operation,
      afterSanitized,
      buildAuditChanges(before, afterRaw),
      undefined,
      before,
      afterRaw,
    );
  });

  queryPre(schema, "findOneAndDelete", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    this._auditBefore = await internalFindOne(
      this.model.findOne(this.getQuery()),
    ).lean<Record<string, unknown> | null>();
  });

  queryPost(schema, "findOneAndDelete", async function (this: QueryWithAuditState, doc: unknown) {
    const resultDoc = doc as Document | null;
    if (isAuditInternal(this)) {
      return;
    }
    const before = sanitizeAuditSnapshot(this._auditBefore ?? resultDoc?.toObject());
    if (!before) {
      return;
    }
    await logDocumentEvent(
      collectionName,
      "deleted",
      before,
      buildAuditChanges(before, null),
    );
  });

  queryPre(schema, "deleteOne", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    this._auditBefore = await internalFindOne(
      this.model.findOne(this.getQuery()),
    ).lean<Record<string, unknown> | null>();
  });

  queryPost(schema, "deleteOne", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    const before = sanitizeAuditSnapshot(this._auditBefore);
    if (!before) {
      return;
    }
    await logDocumentEvent(
      collectionName,
      "deleted",
      before,
      buildAuditChanges(before, null),
    );
  });

  queryPost(schema, "findOne", async function (this: QueryWithAuditState, doc: unknown) {
    const resultDoc = doc as Document | null;
    if (isAuditInternal(this) || !resultDoc || shouldSkipDoc(resultDoc as DocWithAuditLocals)) {
      return;
    }
    const snapshot = sanitizeAuditSnapshot(resultDoc.toObject());
    if (!snapshot) {
      return;
    }
    await logDocumentEvent(
      collectionName,
      "read",
      snapshot,
      buildAuditChanges(null, snapshot),
    );
  });

  modelPost(schema, "insertMany", async function (...args: unknown[]) {
    const docs = args[0] as Document[];
    for (const doc of docs) {
      if (shouldSkipDoc(doc as DocWithAuditLocals)) {
        continue;
      }
      const snapshot = sanitizeAuditSnapshot(doc.toObject());
      if (!snapshot) {
        continue;
      }
      await logDocumentEvent(
        collectionName,
        "created",
        snapshot,
        buildAuditChanges(null, snapshot),
      );
    }
  });

  queryPre(schema, "updateMany", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    this._auditBulkMeta = {
      filter: this.getQuery(),
      update: this.getUpdate(),
    };
  });

  queryPost(schema, "updateMany", async function (this: QueryWithAuditState, result: unknown) {
    const writeResult = result as { modifiedCount?: number };
    if (isAuditInternal(this)) {
      return;
    }
    const ctx = getAuditContext();
    const filter = this.getQuery() as Record<string, unknown>;
    const orgId = resolveOrgId(
      null,
      collectionName,
      ctx?.req?.tenantId ?? ctx?.req?.user?.org_id,
      filter,
    );
    if (!orgId) {
      return;
    }
    const action = resolveCrudAction(collectionName, "bulk_updated");
    await emitAudit({
      org_id: orgId,
      action,
      resource: {
        type: collectionName,
        id: orgId,
      },
      metadata: {
        ...this._auditBulkMeta,
        modified_count: writeResult.modifiedCount ?? 0,
      },
    });
  });

  queryPre(schema, "deleteMany", async function (this: QueryWithAuditState) {
    if (isAuditInternal(this)) {
      return;
    }
    const matchedCount = await this.model.countDocuments(this.getQuery());
    this._auditBulkMeta = {
      filter: this.getQuery(),
      matched_count: matchedCount,
    };
  });

  queryPost(schema, "deleteMany", async function (this: QueryWithAuditState, result: unknown) {
    const writeResult = result as { deletedCount?: number };
    if (isAuditInternal(this)) {
      return;
    }
    const ctx = getAuditContext();
    const filter = this.getQuery() as Record<string, unknown>;
    const orgId = resolveOrgId(
      null,
      collectionName,
      ctx?.req?.tenantId ?? ctx?.req?.user?.org_id,
      filter,
    );
    if (!orgId) {
      return;
    }
    const action = resolveCrudAction(collectionName, "bulk_deleted");
    await emitAudit({
      org_id: orgId,
      action,
      resource: {
        type: collectionName,
        id: orgId,
      },
      metadata: {
        ...this._auditBulkMeta,
        deleted_count: writeResult.deletedCount ?? 0,
      },
    });
  });
}
