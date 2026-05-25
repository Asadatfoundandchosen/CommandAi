import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import type { UserRole } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

import { expandPermissions, hasPermission, normalizePermission } from "./permission.js";
import type { IRole } from "./role.model.js";
import { RoleModel } from "./role.model.js";
import {
  ROLE_HIERARCHY_CHAIN,
  ROLE_HIERARCHY_LABEL,
  getEffectiveRoleNames,
  isHierarchyRole,
} from "./role-hierarchy.js";
import {
  getSystemRoleDefinition,
  isSystemRoleName,
  type SystemRoleName,
} from "./system-roles.js";

/** System role ceiling for a custom role hierarchy level (max grantable permissions). */
export function ceilingSystemRoleForLevel(hierarchyLevel: number): SystemRoleName {
  if (hierarchyLevel <= 1) {
    return "org_admin";
  }
  if (hierarchyLevel === 2) {
    return "account_admin";
  }
  if (hierarchyLevel === 3) {
    return "dept_manager";
  }
  return "dept_user";
}

export type RoleHierarchyView = {
  label: string;
  chain: readonly UserRole[];
  inheritance: Record<UserRole, readonly UserRole[]>;
  description: string;
};

@injectable()
export class PermissionResolverService {
  getHierarchyView(): RoleHierarchyView {
    return {
      label: ROLE_HIERARCHY_LABEL,
      chain: ROLE_HIERARCHY_CHAIN,
      inheritance: {
        org_admin: ["account_admin", "dept_manager", "dept_user"],
        account_admin: ["dept_manager", "dept_user"],
        dept_manager: ["dept_user"],
        dept_user: [],
      },
      description:
        "Higher roles automatically inherit all permissions from lower roles in the chain.",
    };
  }

  /**
   * Compute effective permissions (no Redis). Assigned role + inherited lower roles (union).
   */
  async computeEffectivePermissionsUncached(userId: string): Promise<string[]> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    })
      .select("role org_id")
      .lean<{ role: UserRole; org_id: mongoose.Types.ObjectId } | null>();

    if (!user || !isHierarchyRole(user.role)) {
      return [];
    }

    return this.resolvePermissionsForRoleNames(user.role);
  }

  /** Merge permissions for role + all inherited lower roles (from DB or system definitions). */
  async resolvePermissionsForRoleNames(
    role: UserRole | string,
  ): Promise<string[]> {
    const roleNames = getEffectiveRoleNames(role);
    if (roleNames.length === 0) {
      return [];
    }

    const dbRoles = await RoleModel.find({
      name: { $in: roleNames },
      is_system: true,
      org_id: null,
      is_deleted: false,
    }).lean<IRole[]>();

    const byName = new Map(dbRoles.map((r) => [r.name, r]));
    const merged: string[] = [];

    for (const name of roleNames) {
      const doc = byName.get(name);
      const perms = doc?.permissions ?? getSystemRoleDefinition(name)?.permissions ?? [];
      merged.push(...perms);
    }

    return expandPermissions(merged.map(normalizePermission));
  }

  /** Effective permissions for a JWT hierarchy role (with automatic inheritance). */
  async resolveForSystemRole(role: UserRole | string): Promise<string[]> {
    if (!isSystemRoleName(role)) {
      return [];
    }
    return this.resolvePermissionsForRoleNames(role);
  }

  resolveCeilingForLevel(hierarchyLevel: number): Promise<string[]> {
    const ceiling = ceilingSystemRoleForLevel(hierarchyLevel);
    return this.resolveForSystemRole(ceiling);
  }

  async resolveForCustomRoleId(
    orgId: string,
    roleId: string,
  ): Promise<string[] | null> {
    const role = await RoleModel.findOne({
      _id: roleId,
      org_id: orgId,
      is_system: false,
      is_deleted: false,
    }).lean<IRole | null>();

    if (!role) {
      return null;
    }

    return expandPermissions(role.permissions.map(normalizePermission));
  }

  async resolveForUser(
    orgId: string,
    role: UserRole | string,
    customRoleId?: string,
    userId?: string,
    permissionCache?: { getPermissions(userId: string): Promise<string[]> },
  ): Promise<string[]> {
    if (userId && permissionCache) {
      return permissionCache.getPermissions(userId);
    }
    if (userId) {
      return this.computeEffectivePermissionsUncached(userId);
    }

    if (customRoleId && mongoose.Types.ObjectId.isValid(customRoleId)) {
      const custom = await this.resolveForCustomRoleId(orgId, customRoleId);
      if (custom) {
        return custom;
      }
    }
    if (isSystemRoleName(role)) {
      return this.resolveForSystemRole(role);
    }
    return [];
  }

  async assertWithinHierarchyCeiling(
    hierarchyLevel: number,
    permissions: string[],
  ): Promise<void> {
    const ceiling = await this.resolveCeilingForLevel(hierarchyLevel);
    for (const perm of permissions) {
      const normalized = normalizePermission(perm);
      if (!hasPermission(ceiling, normalized)) {
        throw new Error(
          `Permission ${normalized} exceeds hierarchy ceiling (level ${hierarchyLevel})`,
        );
      }
    }
  }

}
