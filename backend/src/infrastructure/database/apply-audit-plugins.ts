import mongoose from "mongoose";

import {
  AUDIT_PLUGIN_FLAG,
  auditPlugin,
} from "@common/audit/mongoose-audit.plugin.js";

import "./load-models.js";

const SKIP_MODELS = new Set(["AuditLog"]);

/**
 * Apply CRUD audit plugin to every registered Mongoose model except `AuditLog`.
 */
export function applyAuditPluginsToAllModels(): void {
  for (const modelName of mongoose.modelNames()) {
    if (SKIP_MODELS.has(modelName)) {
      continue;
    }
    const model = mongoose.model(modelName);
    const schema = model.schema as typeof model.schema & {
      [AUDIT_PLUGIN_FLAG]?: boolean;
    };
    if (schema[AUDIT_PLUGIN_FLAG]) {
      continue;
    }
    schema.plugin(auditPlugin);
  }
}
