import { randomUUID } from "node:crypto";

import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import {
  AccountNotInOrganizationError,
  HierarchyValidator,
  OrganizationNotFoundError,
} from "@common/validators/hierarchy.validator.js";
import { expandPermissions, normalizePermission } from "@modules/rbac/permission.js";
import { validateRolePermissions } from "@modules/rbac/permissions.js";
import { TYPES } from "../../types.js";
import { AuditService } from "../audit/audit.service.js";

import {
  apiKeyDisplayPrefix,
  generateApiKeySecret,
  hashApiKey,
  verifyApiKeyHash,
} from "./api-key.crypto.js";
import { type IAPIKey, APIKeyModel } from "./api-key.model.js";

export type CreateApiKeyDTO = {
  name: string;
  account_id?: string;
  permissions: string[];
  rate_limit?: number;
  expires_at?: Date;
};

export type UpdateApiKeyDTO = {
  name?: string;
  permissions?: string[];
  rate_limit?: number;
  expires_at?: Date | null;
  is_active?: boolean;
};

export type ApiKeyPublicView = {
  id: string;
  org_id: string;
  account_id: string | null;
  name: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  expires_at: string | null;
  last_used: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiKeyCreateResult = ApiKeyPublicView & { key: string };

export class ApiKeyNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`API key not found: ${id}`);
    this.name = "ApiKeyNotFoundError";
  }
}

export class ApiKeyInactiveError extends Error {
  constructor() {
    super("API key is inactive or expired");
    this.name = "ApiKeyInactiveError";
  }
}

export class InvalidApiKeyError extends Error {
  constructor() {
    super("Invalid API key");
    this.name = "InvalidApiKeyError";
  }
}

function toPublicView(doc: IAPIKey): ApiKeyPublicView {
  return {
    id: String(doc._id),
    org_id: String(doc.org_id),
    account_id: doc.account_id ? String(doc.account_id) : null,
    name: doc.name,
    key_prefix: doc.key_prefix,
    permissions: [...doc.permissions],
    rate_limit: doc.rate_limit,
    expires_at: doc.expires_at ? doc.expires_at.toISOString() : null,
    last_used: doc.last_used ? doc.last_used.toISOString() : null,
    is_active: doc.is_active,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

@injectable()
export class ApiKeyService {
  constructor(
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.AuditService)
    private readonly audit: AuditService,
  ) {}

  async createKey(
    orgId: string,
    createdBy: string,
    data: CreateApiKeyDTO,
  ): Promise<ApiKeyCreateResult> {
    await this.hierarchy.assertOrganizationExists(orgId);
    if (data.account_id) {
      await this.hierarchy.assertAccountBelongsToOrg(data.account_id, orgId);
    }

    const permissions = validateRolePermissions(data.permissions).map(normalizePermission);
    const secret = generateApiKeySecret();

    const doc = await APIKeyModel.create({
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: data.account_id ? new mongoose.Types.ObjectId(data.account_id) : null,
      name: data.name.trim(),
      key_prefix: apiKeyDisplayPrefix(secret),
      key_hash: hashApiKey(secret),
      permissions,
      rate_limit: data.rate_limit ?? 1000,
      expires_at: data.expires_at ?? null,
      created_by: new mongoose.Types.ObjectId(createdBy),
      updated_by: new mongoose.Types.ObjectId(createdBy),
      is_active: true,
      is_deleted: false,
    });

    await this.logAudit(orgId, createdBy, "api_key.created", String(doc._id), {
      name: doc.name,
      account_id: data.account_id ?? null,
      key_prefix: doc.key_prefix,
    });

    return { ...toPublicView(doc), key: secret };
  }

  async listKeys(
    orgId: string,
    filters?: { account_id?: string; is_active?: boolean },
  ): Promise<ApiKeyPublicView[]> {
    const query: Record<string, unknown> = {
      org_id: new mongoose.Types.ObjectId(orgId),
      is_deleted: false,
    };
    if (filters?.account_id) {
      query.account_id = new mongoose.Types.ObjectId(filters.account_id);
    }
    if (filters?.is_active !== undefined) {
      query.is_active = filters.is_active;
    }

    const docs = await APIKeyModel.find(query).sort({ created_at: -1 }).lean<IAPIKey[]>();
    return docs.map(toPublicView);
  }

  async getById(orgId: string, id: string): Promise<ApiKeyPublicView> {
    const doc = await this.findActiveDoc(orgId, id);
    return toPublicView(doc);
  }

  async updateKey(
    orgId: string,
    id: string,
    updatedBy: string,
    data: UpdateApiKeyDTO,
  ): Promise<ApiKeyPublicView> {
    const doc = await APIKeyModel.findOne({
      _id: id,
      org_id: orgId,
      is_deleted: false,
    });
    if (!doc) {
      throw new ApiKeyNotFoundError(id);
    }

    if (data.name !== undefined) {
      doc.name = data.name.trim();
    }
    if (data.permissions !== undefined) {
      doc.permissions = validateRolePermissions(data.permissions).map(normalizePermission);
    }
    if (data.rate_limit !== undefined) {
      doc.rate_limit = data.rate_limit;
    }
    if (data.expires_at !== undefined) {
      doc.expires_at = data.expires_at;
    }
    if (data.is_active !== undefined) {
      doc.is_active = data.is_active;
    }
    doc.updated_by = new mongoose.Types.ObjectId(updatedBy);
    await doc.save();

    await this.logAudit(orgId, updatedBy, "api_key.updated", id, { fields: Object.keys(data) });

    return toPublicView(doc);
  }

  /** Deactivate key (revoke). */
  async revokeKey(orgId: string, id: string, updatedBy: string): Promise<ApiKeyPublicView> {
    return this.updateKey(orgId, id, updatedBy, { is_active: false });
  }

  /** Issue a new secret; previous hash is replaced. Returns plaintext key once. */
  async rotateKey(orgId: string, id: string, updatedBy: string): Promise<ApiKeyCreateResult> {
    const doc = await APIKeyModel.findOne({
      _id: id,
      org_id: orgId,
      is_deleted: false,
    });
    if (!doc) {
      throw new ApiKeyNotFoundError(id);
    }

    const secret = generateApiKeySecret();
    doc.key_prefix = apiKeyDisplayPrefix(secret);
    doc.key_hash = hashApiKey(secret);
    doc.is_active = true;
    doc.updated_by = new mongoose.Types.ObjectId(updatedBy);
    await doc.save();

    await this.logAudit(orgId, updatedBy, "api_key.rotated", id, {
      key_prefix: doc.key_prefix,
    });

    return { ...toPublicView(doc), key: secret };
  }

  /**
   * Validate bearer secret and return auth context.
   * Updates `last_used` asynchronously.
   */
  async authenticate(rawKey: string): Promise<{
    apiKeyId: string;
    orgId: string;
    accountId: string | null;
    permissions: string[];
    rateLimit: number;
  }> {
    if (!rawKey.startsWith("1cmd_")) {
      throw new InvalidApiKeyError();
    }

    const keyHash = hashApiKey(rawKey);
    const doc = await APIKeyModel.findOne({
      key_hash: keyHash,
      is_deleted: false,
      is_active: true,
    }).lean<IAPIKey | null>();

    if (!doc || !verifyApiKeyHash(rawKey, doc.key_hash)) {
      throw new InvalidApiKeyError();
    }

    if (doc.expires_at && doc.expires_at.getTime() < Date.now()) {
      throw new ApiKeyInactiveError();
    }

    void APIKeyModel.updateOne({ _id: doc._id }, { $set: { last_used: new Date() } }).exec();

    return {
      apiKeyId: String(doc._id),
      orgId: String(doc.org_id),
      accountId: doc.account_id ? String(doc.account_id) : null,
      permissions: expandPermissions(doc.permissions.map(normalizePermission)),
      rateLimit: doc.rate_limit,
    };
  }

  private async findActiveDoc(orgId: string, id: string): Promise<IAPIKey> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiKeyNotFoundError(id);
    }
    const doc = await APIKeyModel.findOne({
      _id: id,
      org_id: orgId,
      is_deleted: false,
    }).lean<IAPIKey | null>();
    if (!doc) {
      throw new ApiKeyNotFoundError(id);
    }
    return doc;
  }

  private async logAudit(
    orgId: string,
    userId: string,
    action: string,
    resourceId: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.indexAuditEvent(
        {
          org_id: orgId,
          user_id: userId,
          action,
          resource: "api_key",
          resource_id: resourceId,
          changes,
        },
        { id: `api-key-audit-${randomUUID()}` },
      );
    } catch (e) {
      process.stderr.write(`[api-keys] audit log failed: ${String(e)}\n`);
    }
  }
}

export { OrganizationNotFoundError, AccountNotInOrganizationError };
