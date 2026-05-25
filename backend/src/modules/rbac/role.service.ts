import { inject, injectable } from "inversify";
import mongoose from "mongoose";
import { MongoServerError } from "mongodb";

import type { IRole } from "./role.model.js";
import { RoleModel } from "./role.model.js";
import { PermissionCacheService } from "./permission-cache.service.js";
import { PermissionResolverService } from "./permission-resolver.service.js";
import { InvalidPermissionsError, validateRolePermissions } from "./permissions.js";
import { SYSTEM_ROLE_DEFINITIONS, isSystemRoleName } from "./system-roles.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import type { AdminAuditActor } from "../audit/admin-audit.service.js";

export { InvalidPermissionsError };

export class SystemRoleProtectedError extends Error {
  constructor(message = "System roles cannot be modified or deleted") {
    super(message);
    this.name = "SystemRoleProtectedError";
  }
}

export class RoleNotFoundError extends Error {
  constructor() {
    super("Role not found");
    this.name = "RoleNotFoundError";
  }
}

export type RoleView = {
  id: string;
  org_id: string | null;
  name: string;
  display_name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  hierarchy_level: number;
  created_at: string;
  updated_at: string;
};

function toView(role: IRole): RoleView {
  return {
    id: String(role._id),
    org_id: role.org_id ? String(role.org_id) : null,
    name: role.name,
    display_name: role.display_name,
    description: role.description,
    permissions: role.permissions,
    is_system: role.is_system,
    hierarchy_level: role.hierarchy_level,
    created_at: role.created_at.toISOString(),
    updated_at: role.updated_at.toISOString(),
  };
}

@injectable()
export class RoleService {
  constructor(
    @inject(PermissionResolverService)
    private readonly permissionResolver: PermissionResolverService,
    @inject(PermissionCacheService)
    private readonly permissionCache: PermissionCacheService,
    @inject(AdminAuditService)
    private readonly adminAudit: AdminAuditService,
  ) {}

  /** Upsert built-in system roles (org_id null). Idempotent on startup. */
  async ensureSystemRolesSeeded(): Promise<void> {
    for (const def of SYSTEM_ROLE_DEFINITIONS) {
      await RoleModel.findOneAndUpdate(
        { name: def.name, is_system: true, org_id: null },
        {
          $set: {
            display_name: def.display_name,
            description: def.description,
            permissions: [...def.permissions],
            hierarchy_level: def.hierarchy_level,
            is_system: true,
            is_deleted: false,
          },
          $setOnInsert: { org_id: null },
        },
        { upsert: true, new: true },
      );
    }
    await this.permissionCache.invalidateAll();
  }

  async listRoles(orgId: string): Promise<RoleView[]> {
    const roles = await RoleModel.find({
      is_deleted: false,
      $or: [{ is_system: true, org_id: null }, { org_id: orgId, is_system: false }],
    })
      .sort({ hierarchy_level: 1, name: 1 })
      .lean<IRole[]>();

    return roles.map(toView);
  }

  async getRole(orgId: string, roleId: string): Promise<RoleView> {
    const role = await this.findAccessibleRole(orgId, roleId);
    return toView(role);
  }

  async createRole(
    orgId: string,
    input: {
      name: string;
      display_name: string;
      description: string;
      permissions: string[];
      hierarchy_level: number;
    },
    auditActor?: AdminAuditActor,
  ): Promise<RoleView> {
    if (isSystemRoleName(input.name)) {
      throw new InvalidPermissionsError("Name conflicts with a system role");
    }

    const permissions = validateRolePermissions(input.permissions);
    try {
      await this.permissionResolver.assertWithinHierarchyCeiling(
        input.hierarchy_level,
        permissions,
      );
    } catch (e) {
      throw new InvalidPermissionsError(
        e instanceof Error ? e.message : "Permission exceeds hierarchy ceiling",
      );
    }

    try {
      const doc = await RoleModel.create({
        org_id: new mongoose.Types.ObjectId(orgId),
        name: input.name.toLowerCase(),
        display_name: input.display_name,
        description: input.description,
        permissions,
        is_system: false,
        hierarchy_level: input.hierarchy_level,
        is_deleted: false,
      });
      const view = toView(doc.toObject() as IRole);
      if (auditActor) {
        await this.adminAudit.logAdminAction(
          ADMIN_EVENTS.ROLE_CREATED,
          orgId,
          auditActor,
          { type: "role", id: view.id, name: view.name },
          { after: { ...view } },
        );
      }
      return view;
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000) {
        throw new InvalidPermissionsError(`Role name already exists: ${input.name}`);
      }
      throw e;
    }
  }

  async updateRole(
    orgId: string,
    roleId: string,
    input: {
      display_name?: string;
      description?: string;
      permissions?: string[];
      hierarchy_level?: number;
    },
    auditActor?: AdminAuditActor,
  ): Promise<RoleView> {
    const existing = await this.findAccessibleRole(orgId, roleId);
    if (existing.is_system) {
      throw new SystemRoleProtectedError();
    }
    if (existing.org_id && String(existing.org_id) !== orgId) {
      throw new RoleNotFoundError();
    }

    const setDoc: Record<string, unknown> = {};
    if (input.display_name !== undefined) setDoc.display_name = input.display_name;
    if (input.description !== undefined) setDoc.description = input.description;
    if (input.hierarchy_level !== undefined) setDoc.hierarchy_level = input.hierarchy_level;
    if (input.permissions !== undefined) {
      const validated = validateRolePermissions(input.permissions);
      const level = input.hierarchy_level ?? existing.hierarchy_level;
      try {
        await this.permissionResolver.assertWithinHierarchyCeiling(level, validated);
      } catch (e) {
        throw new InvalidPermissionsError(
          e instanceof Error ? e.message : "Permission exceeds hierarchy ceiling",
        );
      }
      setDoc.permissions = validated;
    }

    const updated = await RoleModel.findOneAndUpdate(
      { _id: roleId, org_id: orgId, is_system: false, is_deleted: false },
      { $set: setDoc },
      { new: true },
    ).lean<IRole | null>();

    if (!updated) {
      throw new RoleNotFoundError();
    }

    await this.permissionCache.invalidateForRole(roleId).catch(() => undefined);

    const view = toView(updated);
    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.ROLE_UPDATED,
        orgId,
        auditActor,
        { type: "role", id: view.id, name: view.name },
        {
          before: { ...toView(existing) },
          after: { ...view },
        },
      );
    }
    return view;
  }

  async deleteRole(
    orgId: string,
    roleId: string,
    auditActor?: AdminAuditActor,
  ): Promise<void> {
    const existing = await this.findAccessibleRole(orgId, roleId);
    if (existing.is_system) {
      throw new SystemRoleProtectedError();
    }

    const result = await RoleModel.updateOne(
      { _id: roleId, org_id: orgId, is_system: false, is_deleted: false },
      { $set: { is_deleted: true } },
    );

    if (result.matchedCount === 0) {
      throw new RoleNotFoundError();
    }

    await this.permissionCache.invalidateForRole(roleId).catch(() => undefined);

    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.ROLE_DELETED,
        orgId,
        auditActor,
        { type: "role", id: roleId, name: existing.name },
        { before: { ...toView(existing) } },
      );
    }
  }

  private async findAccessibleRole(orgId: string, roleId: string): Promise<IRole> {
    const role = await RoleModel.findOne({
      _id: roleId,
      is_deleted: false,
      $or: [{ is_system: true, org_id: null }, { org_id: orgId, is_system: false }],
    }).lean<IRole | null>();

    if (!role) {
      throw new RoleNotFoundError();
    }

    return role;
  }
}
