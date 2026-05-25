import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "@common/validators/hierarchy.validator.js";
import type { IUser, UserRole } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";
import { TYPES } from "../../types.js";

import type { GroupRoleMappingEntry, IGroupMapping } from "./group-mapping.model.js";
import { GroupMappingModel } from "./group-mapping.model.js";
import {
  extractIdpGroupsFromSsoProfile,
  getHighestRole,
  pickMappingForRole,
  ROLE_PRECEDENCE,
} from "./group-mapping.logic.js";
import { logGroupMappingEvent } from "./group-mapping.logger.js";
import type { UpsertGroupMappingBody } from "./group-mapping.validation.js";
import type { SSOProfile } from "./sso-profile.types.js";
import { PermissionCacheService } from "../rbac/permission-cache.service.js";

export type GroupMappingView = {
  org_id: string;
  enabled: boolean;
  fallback_role: UserRole;
  mappings: {
    idp_group: string;
    role: UserRole;
    account_id: string | null;
    department_id: string | null;
  }[];
  role_precedence: readonly UserRole[];
};

@injectable()
export class GroupMappingService {
  constructor(
    @inject(TYPES.HierarchyValidator) private readonly hierarchy: HierarchyValidator,
    @inject(PermissionCacheService)
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async getMappingForOrg(orgId: string): Promise<GroupMappingView | null> {
    const row = await GroupMappingModel.findOne({ org_id: orgId }).lean<IGroupMapping | null>();
    return row ? this.toView(orgId, row) : null;
  }

  async upsertMapping(orgId: string, body: UpsertGroupMappingBody): Promise<GroupMappingView> {
    const entries: GroupRoleMappingEntry[] = (body.mappings ?? []).map((m) => ({
      idp_group: m.idp_group.trim(),
      role: m.role,
      account_id: m.account_id
        ? new mongoose.Types.ObjectId(m.account_id)
        : undefined,
      department_id: m.department_id
        ? new mongoose.Types.ObjectId(m.department_id)
        : undefined,
    }));

    for (const entry of entries) {
      if (entry.account_id && entry.department_id) {
        await this.hierarchy.assertUserHierarchy(
          orgId,
          String(entry.account_id),
          String(entry.department_id),
        );
      } else if (entry.account_id || entry.department_id) {
        throw new Error(
          `Group "${entry.idp_group}" must include both account_id and department_id when scoped`,
        );
      }
    }

    const row = await GroupMappingModel.findOneAndUpdate(
      { org_id: orgId },
      {
        $set: {
          enabled: body.enabled,
          fallback_role: body.fallback_role ?? "dept_user",
          mappings: entries,
        },
        $setOnInsert: { org_id: new mongoose.Types.ObjectId(orgId) },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean<IGroupMapping | null>();

    if (!row) {
      throw new Error("Failed to save group mapping");
    }

    return this.toView(orgId, row);
  }

  /** Sync application role (and optional scope) from IdP groups on SSO login. */
  async syncUserGroups(userId: string, idpGroups: string[]): Promise<void> {
    const user = await UserModel.findById(userId).lean<IUser | null>();
    if (!user || user.is_deleted) {
      return;
    }

    const config = await GroupMappingModel.findOne({
      org_id: user.org_id,
      enabled: true,
    }).lean<IGroupMapping | null>();

    if (!config) {
      return;
    }

    const matched = config.mappings.filter((m) => idpGroups.includes(m.idp_group));
    const matchedRoles = matched.map((m) => m.role);
    const newRole =
      matchedRoles.length > 0
        ? getHighestRole(matchedRoles)!
        : config.fallback_role;

    const winning = pickMappingForRole(matched, newRole);

    const setDoc: Record<string, unknown> = {
      role: newRole,
      updated_by: user._id,
    };

    if (winning?.account_id && winning.department_id) {
      const accountId = String(winning.account_id);
      const departmentId = String(winning.department_id);
      await this.hierarchy.assertUserHierarchy(
        String(user.org_id),
        accountId,
        departmentId,
      );
      setDoc.account_id = winning.account_id;
      setDoc.department_id = winning.department_id;
    }

    const roleChanged = newRole !== user.role;
    const scopeChanged =
      winning?.account_id &&
      winning.department_id &&
      (String(user.account_id) !== String(winning.account_id) ||
        String(user.department_id) !== String(winning.department_id));

    if (!roleChanged && !scopeChanged) {
      return;
    }

    await UserModel.updateOne({ _id: userId }, { $set: setDoc });

    if (roleChanged) {
      await this.permissionCache.invalidate(userId).catch(() => undefined);
      this.logRoleChange(
        userId,
        String(user.org_id),
        user.role,
        newRole,
        idpGroups,
        matched.map((m) => m.idp_group),
      );
    }
  }

  /** Extract groups from SSO profile and sync roles. */
  async syncUserGroupsFromProfile(
    userId: string,
    profile: SSOProfile,
  ): Promise<void> {
    const idpGroups = extractIdpGroupsFromSsoProfile(profile);
    await this.syncUserGroups(userId, idpGroups);
  }

  private logRoleChange(
    userId: string,
    orgId: string,
    previousRole: UserRole,
    newRole: UserRole,
    idpGroups: string[],
    matchedGroups: string[],
  ): void {
    logGroupMappingEvent("sso_role_changed", {
      user_id: userId,
      org_id: orgId,
      previous_role: previousRole,
      new_role: newRole,
      idp_group_count: idpGroups.length,
      matched_group_count: matchedGroups.length,
      matched_groups: matchedGroups.join(","),
    });
  }

  private toView(orgId: string, row: IGroupMapping): GroupMappingView {
    return {
      org_id: orgId,
      enabled: row.enabled,
      fallback_role: row.fallback_role,
      mappings: row.mappings.map((m) => ({
        idp_group: m.idp_group,
        role: m.role,
        account_id: m.account_id ? String(m.account_id) : null,
        department_id: m.department_id ? String(m.department_id) : null,
      })),
      role_precedence: ROLE_PRECEDENCE,
    };
  }
}
