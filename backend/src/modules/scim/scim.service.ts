import { randomBytes } from "node:crypto";
import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { config as appConfig } from "@config/index.js";
import { HierarchyValidator } from "@common/validators/hierarchy.validator.js";
import { PlanLimitsValidator } from "@common/validators/plan-limits.validator.js";
import { PasswordService } from "@modules/auth/password.service.js";
import type { IUser, UserRole } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";
import { TYPES } from "../../types.js";

import type { IScimConfig } from "./scim-config.model.js";
import { ScimConfigModel } from "./scim-config.model.js";
import type { IScimGroup } from "./scim-group.model.js";
import { ScimGroupModel } from "./scim-group.model.js";
import {
  SCIM_DEFAULT_PAGE_SIZE,
  SCIM_GROUP_SCHEMA,
  SCIM_LIST_SCHEMA,
  SCIM_MAX_PAGE_SIZE,
  SCIM_USER_SCHEMA,
} from "./scim.constants.js";
import { buildGroupMongoFilter, buildUserMongoFilter, parseScimFilter } from "./scim-filter.js";
import { logScimOperation } from "./scim.logger.js";
import {
  mapGroupToScim,
  mapScimGroupInput,
  mapScimUserInput,
  mapUserToScim,
} from "./scim.mapper.js";
import { applyScimGroupPatch, applyScimUserPatch } from "./scim-patch.js";
import {
  generateScimBearerToken,
  hashScimBearerToken,
  verifyScimBearerToken,
} from "./scim-token.js";
import type {
  ScimGroupInput,
  ScimGroupResource,
  ScimListResponse,
  ScimPatchBody,
  ScimUserInput,
  ScimUserResource,
} from "./scim.types.js";

export class ScimNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "ScimNotFoundError";
  }
}

export class ScimConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScimConflictError";
  }
}

export type ScimConfigView = {
  org_id: string;
  enabled: boolean;
  default_role: UserRole;
  default_account_id: string;
  default_department_id: string;
  bearer_token?: string;
};

@injectable()
export class ScimService {
  constructor(
    @inject(TYPES.HierarchyValidator) private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
    @inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  async resolveOrgFromBearerToken(token: string): Promise<string | null> {
    const hash = hashScimBearerToken(token);
    const config = await ScimConfigModel.findOne({
      enabled: true,
      bearer_token_hash: hash,
    })
      .select("+bearer_token_hash org_id")
      .lean<IScimConfig | null>();

    if (!config) {
      return null;
    }

    if (!verifyScimBearerToken(token, config.bearer_token_hash)) {
      return null;
    }

    return String(config.org_id);
  }

  async getConfigForOrg(orgId: string): Promise<Omit<ScimConfigView, "bearer_token">> {
    const config = await ScimConfigModel.findOne({ org_id: orgId }).lean<IScimConfig | null>();
    if (!config) {
      return {
        org_id: orgId,
        enabled: false,
        default_role: "dept_user",
        default_account_id: "",
        default_department_id: "",
      };
    }
    return {
      org_id: orgId,
      enabled: config.enabled,
      default_role: config.default_role,
      default_account_id: String(config.default_account_id),
      default_department_id: String(config.default_department_id),
    };
  }

  async upsertConfig(
    orgId: string,
    input: {
      enabled: boolean;
      default_role?: UserRole;
      default_account_id: string;
      default_department_id: string;
      rotate_token?: boolean;
    },
  ): Promise<ScimConfigView> {
    await this.hierarchy.assertUserHierarchy(
      orgId,
      input.default_account_id,
      input.default_department_id,
    );

    const existing = await ScimConfigModel.findOne({ org_id: orgId })
      .select("+bearer_token_hash")
      .lean<IScimConfig | null>();

    let bearerToken: string | undefined;
    let bearerHash = existing?.bearer_token_hash;

    if (!existing || input.rotate_token || input.enabled) {
      if (input.enabled && (!existing || input.rotate_token || !bearerHash)) {
        bearerToken = generateScimBearerToken();
        bearerHash = hashScimBearerToken(bearerToken);
      }
    }

    if (input.enabled && !bearerHash) {
      bearerToken = generateScimBearerToken();
      bearerHash = hashScimBearerToken(bearerToken);
    }

    const row = await ScimConfigModel.findOneAndUpdate(
      { org_id: orgId },
      {
        $set: {
          enabled: input.enabled,
          default_role: input.default_role ?? existing?.default_role ?? "dept_user",
          default_account_id: new mongoose.Types.ObjectId(input.default_account_id),
          default_department_id: new mongoose.Types.ObjectId(input.default_department_id),
          ...(bearerHash ? { bearer_token_hash: bearerHash } : {}),
        },
        $setOnInsert: { org_id: new mongoose.Types.ObjectId(orgId) },
      },
      { upsert: true, new: true },
    ).lean<IScimConfig | null>();

    if (!row) {
      throw new Error("Failed to persist SCIM configuration");
    }

    return {
      org_id: orgId,
      enabled: row.enabled,
      default_role: row.default_role,
      default_account_id: String(row.default_account_id),
      default_department_id: String(row.default_department_id),
      ...(bearerToken ? { bearer_token: bearerToken } : {}),
    };
  }

  private async requireConfig(orgId: string): Promise<IScimConfig> {
    const config = await ScimConfigModel.findOne({ org_id: orgId, enabled: true }).lean<
      IScimConfig | null
    >();
    if (!config) {
      throw new ScimNotFoundError("SCIM configuration");
    }
    return config;
  }

  async listUsers(
    orgId: string,
    filterRaw?: string,
    startIndex = 1,
    count = SCIM_DEFAULT_PAGE_SIZE,
  ): Promise<ScimListResponse<ScimUserResource>> {
    await this.requireConfig(orgId);
    const filter = parseScimFilter(filterRaw);
    const mongoFilter = buildUserMongoFilter(orgId, filter);
    const limit = Math.min(Math.max(count, 1), SCIM_MAX_PAGE_SIZE);
    const skip = Math.max(startIndex - 1, 0);

    const [total, users] = await Promise.all([
      UserModel.countDocuments(mongoFilter),
      UserModel.find(mongoFilter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IUser[]>(),
    ]);

    logScimOperation("scim_user_list", {
      org_id: orgId,
      total,
      start_index: startIndex,
      count: limit,
    });

    return {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: total,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) => mapUserToScim(u, orgId)),
    };
  }

  async getUser(orgId: string, userId: string): Promise<ScimUserResource> {
    await this.requireConfig(orgId);
    const user = await this.findUser(orgId, userId);
    logScimOperation("scim_user_get", { org_id: orgId, user_id: userId });
    return mapUserToScim(user, orgId);
  }

  async createUser(orgId: string, body: ScimUserInput): Promise<ScimUserResource> {
    const config = await this.requireConfig(orgId);
    const mapped = mapScimUserInput(body);

    if (!mapped.email.includes("@")) {
      throw new ScimConflictError("userName or primary email is required");
    }

    const existing = await UserModel.findOne({
      org_id: orgId,
      email: mapped.email,
      is_deleted: false,
    }).lean();

    if (existing) {
      throw new ScimConflictError("User already exists");
    }

    await this.planLimits.assertCanCreateUser(orgId);

    const actorId = await this.resolveScimActorId(orgId);
    const password_hash = await this.passwords.hashPassword(
      randomBytes(32).toString("base64url"),
    );

    const user = await UserModel.create({
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: config.default_account_id,
      department_id: config.default_department_id,
      email: mapped.email,
      password_hash,
      first_name: mapped.first_name,
      last_name: mapped.last_name,
      role: config.default_role,
      status: mapped.active ? "active" : "inactive",
      scim_external_id: mapped.external_id,
      sso_provider: "scim",
      mfa_enabled: false,
      password_change_required: true,
      last_login: null,
      created_by: actorId,
      updated_by: actorId,
      is_deleted: false,
    });

    const doc = user.toObject() as IUser;
    logScimOperation("scim_user_create", {
      org_id: orgId,
      user_id: String(doc._id),
      email_domain: mapped.email.split("@")[1],
    });

    return mapUserToScim(doc, orgId);
  }

  async updateUser(
    orgId: string,
    userId: string,
    body: ScimUserInput | ScimPatchBody,
  ): Promise<ScimUserResource> {
    await this.requireConfig(orgId);
    const user = await this.findUser(orgId, userId);

    let patchInput: ScimUserInput;
    if ("Operations" in body) {
      const merged = applyScimUserPatch(
        {
          userName: user.email,
          name: { givenName: user.first_name, familyName: user.last_name },
          emails: [{ value: user.email, primary: true }],
          active: user.status === "active",
          externalId: user.scim_external_id,
        },
        body,
      );
      patchInput = merged as ScimUserInput;
    } else {
      patchInput = body;
    }

    const mapped = mapScimUserInput(patchInput);
    const setDoc: Record<string, unknown> = {
      updated_by: await this.resolveScimActorId(orgId),
    };

    if (mapped.email) setDoc.email = mapped.email;
    if (mapped.first_name) setDoc.first_name = mapped.first_name;
    if (mapped.last_name) setDoc.last_name = mapped.last_name;
    setDoc.status = mapped.active ? "active" : "inactive";
    if (mapped.external_id) setDoc.scim_external_id = mapped.external_id;

    const updated = await UserModel.findOneAndUpdate(
      { _id: userId, org_id: orgId, is_deleted: false },
      { $set: setDoc },
      { new: true },
    ).lean<IUser | null>();

    if (!updated) {
      throw new ScimNotFoundError("User");
    }

    logScimOperation("scim_user_update", { org_id: orgId, user_id: userId });
    return mapUserToScim(updated, orgId);
  }

  async deactivateUser(orgId: string, userId: string): Promise<void> {
    await this.requireConfig(orgId);
    const result = await UserModel.updateOne(
      { _id: userId, org_id: orgId, is_deleted: false },
      {
        $set: {
          status: "inactive",
          is_deleted: true,
          updated_by: await this.resolveScimActorId(orgId),
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new ScimNotFoundError("User");
    }

    logScimOperation("scim_user_deactivate", { org_id: orgId, user_id: userId });
  }

  async listGroups(
    orgId: string,
    filterRaw?: string,
    startIndex = 1,
    count = SCIM_DEFAULT_PAGE_SIZE,
  ): Promise<ScimListResponse<ScimGroupResource>> {
    await this.requireConfig(orgId);
    const filter = parseScimFilter(filterRaw);
    const mongoFilter = buildGroupMongoFilter(orgId, filter);
    const limit = Math.min(Math.max(count, 1), SCIM_MAX_PAGE_SIZE);
    const skip = Math.max(startIndex - 1, 0);

    const [total, groups] = await Promise.all([
      ScimGroupModel.countDocuments(mongoFilter),
      ScimGroupModel.find(mongoFilter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IScimGroup[]>(),
    ]);

    logScimOperation("scim_group_list", { org_id: orgId, total, start_index: startIndex });

    return {
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: total,
      startIndex,
      itemsPerPage: groups.length,
      Resources: groups.map((g) => mapGroupToScim(g, orgId)),
    };
  }

  async getGroup(orgId: string, groupId: string): Promise<ScimGroupResource> {
    await this.requireConfig(orgId);
    const group = await this.findGroup(orgId, groupId);
    logScimOperation("scim_group_get", { org_id: orgId, group_id: groupId });
    return mapGroupToScim(group, orgId);
  }

  async createGroup(orgId: string, body: ScimGroupInput): Promise<ScimGroupResource> {
    await this.requireConfig(orgId);
    const mapped = mapScimGroupInput(body);

    if (mapped.external_id) {
      const dup = await ScimGroupModel.findOne({
        org_id: orgId,
        external_id: mapped.external_id,
        is_deleted: false,
      }).lean();
      if (dup) {
        throw new ScimConflictError("Group externalId already exists");
      }
    }

    const memberIds = await this.resolveMemberIds(orgId, mapped.member_ids);

    const group = await ScimGroupModel.create({
      org_id: new mongoose.Types.ObjectId(orgId),
      display_name: mapped.display_name,
      external_id: mapped.external_id,
      members: memberIds.map((id) => new mongoose.Types.ObjectId(id)),
      is_deleted: false,
    });

    const doc = group.toObject();
    logScimOperation("scim_group_create", {
      org_id: orgId,
      group_id: String(doc._id),
      member_count: memberIds.length,
    });

    return mapGroupToScim(doc, orgId);
  }

  async updateGroup(
    orgId: string,
    groupId: string,
    body: ScimGroupInput | ScimPatchBody,
  ): Promise<ScimGroupResource> {
    await this.requireConfig(orgId);
    await this.findGroup(orgId, groupId);

    let displayName: string | undefined;
    let memberIds: string[] | undefined;

    if ("Operations" in body) {
      const patch = applyScimGroupPatch(body);
      displayName = patch.displayName;
      memberIds = patch.memberIds;
    } else {
      const mapped = mapScimGroupInput(body);
      displayName = mapped.display_name;
      memberIds = mapped.member_ids;
    }

    const setDoc: Record<string, unknown> = {};
    if (displayName) setDoc.display_name = displayName;
    if (memberIds) {
      setDoc.members = (await this.resolveMemberIds(orgId, memberIds)).map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }

    const updated = await ScimGroupModel.findOneAndUpdate(
      { _id: groupId, org_id: orgId, is_deleted: false },
      { $set: setDoc },
      { new: true },
    ).lean<IScimGroup | null>();

    if (!updated) {
      throw new ScimNotFoundError("Group");
    }

    logScimOperation("scim_group_update", {
      org_id: orgId,
      group_id: groupId,
      member_count: updated.members.length,
    });

    return mapGroupToScim(updated, orgId);
  }

  async deleteGroup(orgId: string, groupId: string): Promise<void> {
    await this.requireConfig(orgId);
    const result = await ScimGroupModel.updateOne(
      { _id: groupId, org_id: orgId, is_deleted: false },
      { $set: { is_deleted: true } },
    );
    if (result.matchedCount === 0) {
      throw new ScimNotFoundError("Group");
    }
    logScimOperation("scim_group_delete", { org_id: orgId, group_id: groupId });
  }

  getServiceProviderConfig(): Record<string, unknown> {
    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: SCIM_MAX_PAGE_SIZE },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "OAuth Bearer Token",
          description: "SCIM bearer token per organization",
          primary: true,
        },
      ],
      meta: {
        resourceType: "ServiceProviderConfig",
        location: `${appConfig.apiPublicUrl.replace(/\/$/, "")}/scim/v2/ServiceProviderConfig`,
      },
    };
  }

  private async findUser(orgId: string, userId: string): Promise<IUser> {
    const user = await UserModel.findOne({
      _id: userId,
      org_id: orgId,
      is_deleted: false,
    }).lean<IUser | null>();
    if (!user) {
      throw new ScimNotFoundError("User");
    }
    return user;
  }

  private async findGroup(orgId: string, groupId: string): Promise<IScimGroup> {
    const group = await ScimGroupModel.findOne({
      _id: groupId,
      org_id: orgId,
      is_deleted: false,
    }).lean<IScimGroup | null>();
    if (!group) {
      throw new ScimNotFoundError("Group");
    }
    return group;
  }

  private async resolveMemberIds(orgId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const users = await UserModel.find({
      _id: { $in: ids },
      org_id: orgId,
      is_deleted: false,
    })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId }[]>();
    return users.map((u) => String(u._id));
  }

  private async resolveScimActorId(orgId: string): Promise<mongoose.Types.ObjectId> {
    const admin = await UserModel.findOne({
      org_id: orgId,
      role: "org_admin",
      is_deleted: false,
      status: "active",
    })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId } | null>();
    return admin?._id ?? new mongoose.Types.ObjectId(orgId);
  }
}
