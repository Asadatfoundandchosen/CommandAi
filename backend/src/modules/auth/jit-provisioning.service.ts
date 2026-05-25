import { randomBytes } from "node:crypto";
import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "@common/validators/hierarchy.validator.js";
import {
  PlanLimitExceededError,
  PlanLimitsValidator,
} from "@common/validators/plan-limits.validator.js";
import { DepartmentModel } from "@modules/department/department.model.js";
import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";
import { TYPES } from "../../types.js";

import { PasswordService } from "./password.service.js";
import {
  mapFirstName,
  mapLastName,
  readDepartmentHint,
} from "./jit-provisioning.logic.js";
import { logJitProvisioning } from "./jit-provisioning.logger.js";
import type { ISSOMapping } from "./sso-mapping.model.js";
import { SsoMappingModel } from "./sso-mapping.model.js";
import type { SSOProfile } from "./sso-profile.types.js";
import type { UpsertSsoMappingBody } from "./sso-mapping.validation.js";

export class JitProvisioningDisabledError extends Error {
  constructor() {
    super("JIT provisioning is not enabled for this organization");
    this.name = "JitProvisioningDisabledError";
  }
}

export class SsoUserNotFoundError extends Error {
  constructor() {
    super("No active user matches SSO identity and JIT provisioning is disabled");
    this.name = "SsoUserNotFoundError";
  }
}

export class JitProvisioningConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JitProvisioningConfigError";
  }
}

export type SsoMappingView = {
  org_id: string;
  jit_enabled: boolean;
  default_role: ISSOMapping["default_role"];
  default_account_id: string | null;
  default_department_id: string | null;
  first_name_attr: string | null;
  last_name_attr: string | null;
  department_attr: string | null;
};

@injectable()
export class JitProvisioningService {
  constructor(
    @inject(TYPES.HierarchyValidator) private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
    @inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  async getMappingForOrg(orgId: string): Promise<SsoMappingView | null> {
    const row = await SsoMappingModel.findOne({ org_id: orgId }).lean<ISSOMapping | null>();
    return row ? this.toView(orgId, row) : null;
  }

  async upsertMapping(orgId: string, body: UpsertSsoMappingBody): Promise<SsoMappingView> {
    const existing = await SsoMappingModel.findOne({ org_id: orgId }).lean<ISSOMapping | null>();

    const next: Partial<ISSOMapping> = {
      jit_enabled: body.jit_enabled,
      default_role: body.default_role ?? existing?.default_role ?? "dept_user",
      first_name_attr: body.first_name_attr ?? existing?.first_name_attr,
      last_name_attr: body.last_name_attr ?? existing?.last_name_attr,
      department_attr: body.department_attr ?? existing?.department_attr,
    };

    if (body.default_account_id) {
      next.default_account_id = new mongoose.Types.ObjectId(body.default_account_id);
    }
    if (body.default_department_id) {
      next.default_department_id = new mongoose.Types.ObjectId(body.default_department_id);
    }

    if (body.jit_enabled) {
      const accountId =
        body.default_account_id ?? existing?.default_account_id?.toString();
      const departmentId =
        body.default_department_id ?? existing?.default_department_id?.toString();
      if (!accountId || !departmentId) {
        throw new JitProvisioningConfigError(
          "JIT requires default_account_id and default_department_id when enabled",
        );
      }
      await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    }

    const row = await SsoMappingModel.findOneAndUpdate(
      { org_id: orgId },
      {
        $set: next,
        $setOnInsert: { org_id: new mongoose.Types.ObjectId(orgId) },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean<ISSOMapping | null>();

    if (!row) {
      throw new Error("Failed to save SSO mapping");
    }

    return this.toView(orgId, row);
  }

  /**
   * Create or update a user from SSO profile (JIT on first login).
   * Returns the persisted user document (includes password_hash for internal use).
   */
  async provisionUser(orgId: string, ssoProfile: SSOProfile): Promise<IUser> {
    const mapping = await SsoMappingModel.findOne({ org_id: orgId }).lean<ISSOMapping | null>();
    if (!mapping?.jit_enabled) {
      throw new JitProvisioningDisabledError();
    }

    const email = ssoProfile.email.trim().toLowerCase();
    const existing = await UserModel.findOne({
      org_id: orgId,
      email,
      is_deleted: false,
    }).lean<IUser | null>();

    if (!existing) {
      try {
        await this.planLimits.assertCanCreateUser(orgId);
      } catch (e) {
        if (e instanceof PlanLimitExceededError) {
          logJitProvisioning("jit_provisioning_failed", {
            org_id: orgId,
            reason: e.code,
            email_domain: email.split("@")[1],
          });
        }
        throw e;
      }
    }

    const { accountId, departmentId } = await this.resolveDepartment(orgId, ssoProfile, mapping);
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);

    const firstName = mapFirstName(ssoProfile, mapping.first_name_attr);
    const lastName = mapLastName(ssoProfile, mapping.last_name_attr);
    const role = mapping.default_role ?? "dept_user";
    const actorId = await this.resolveJitActorId(orgId);

    const insertFields: Record<string, unknown> = {
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: new mongoose.Types.ObjectId(accountId),
      department_id: new mongoose.Types.ObjectId(departmentId),
      email,
      first_name: firstName,
      last_name: lastName,
      role,
      status: "active",
      sso_provider: ssoProfile.provider,
      sso_id: ssoProfile.sub,
      mfa_enabled: false,
      password_change_required: true,
      last_login: new Date(),
      is_deleted: false,
      created_by: actorId,
      updated_by: actorId,
    };

    if (!existing) {
      const randomPassword = randomBytes(32).toString("base64url");
      insertFields.password_hash = await this.passwords.hashPassword(randomPassword);
    }

    const user = await UserModel.findOneAndUpdate(
      { org_id: orgId, email, is_deleted: false },
      {
        $set: {
          first_name: firstName,
          last_name: lastName,
          sso_provider: ssoProfile.provider,
          sso_id: ssoProfile.sub,
          last_login: new Date(),
          updated_by: actorId,
          status: "active",
        },
        $setOnInsert: insertFields,
      },
      { upsert: true, new: true, runValidators: true },
    ).lean<IUser>();

    if (!user) {
      logJitProvisioning("jit_provisioning_failed", {
        org_id: orgId,
        reason: "upsert_failed",
        provider: ssoProfile.provider,
      });
      throw new Error("JIT user upsert failed");
    }

    if (existing) {
      logJitProvisioning("jit_user_updated", {
        org_id: orgId,
        user_id: String(user._id),
        provider: ssoProfile.provider,
        email_domain: email.split("@")[1],
      });
    } else {
      logJitProvisioning("jit_user_created", {
        org_id: orgId,
        user_id: String(user._id),
        provider: ssoProfile.provider,
        role,
        department_id: departmentId,
        email_domain: email.split("@")[1],
      });
    }

    return user;
  }

  /** Resolve user for SSO login — JIT provision when enabled, otherwise require existing user. */
  async resolveUserForSsoLogin(
    orgId: string,
    ssoProfile: SSOProfile,
  ): Promise<IUser> {
    const mapping = await SsoMappingModel.findOne({ org_id: orgId }).lean<ISSOMapping | null>();
    const email = ssoProfile.email.trim().toLowerCase();

    if (mapping?.jit_enabled) {
      return this.provisionUser(orgId, ssoProfile);
    }

    const user = await UserModel.findOne({
      org_id: orgId,
      email,
      is_deleted: false,
      status: "active",
    }).lean<IUser | null>();

    if (!user) {
      throw new SsoUserNotFoundError();
    }

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          sso_provider: ssoProfile.provider,
          sso_id: ssoProfile.sub,
          last_login: new Date(),
        },
      },
    );

    return user;
  }

  private async resolveDepartment(
    orgId: string,
    ssoProfile: SSOProfile,
    mapping: ISSOMapping,
  ): Promise<{ accountId: string; departmentId: string }> {
    const defaultAccountId = String(mapping.default_account_id);
    const defaultDepartmentId = String(mapping.default_department_id);

    if (!mapping.default_account_id || !mapping.default_department_id) {
      throw new JitProvisioningConfigError(
        "SSO mapping missing default_account_id or default_department_id",
      );
    }

    const deptHint = readDepartmentHint(ssoProfile, mapping.department_attr);
    if (deptHint) {
      const escaped = deptHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dept = await DepartmentModel.findOne({
        org_id: orgId,
        account_id: defaultAccountId,
        name: new RegExp(`^${escaped}$`, "i"),
        is_deleted: false,
        status: "active",
      }).lean();

      if (dept) {
        return {
          accountId: String(dept.account_id),
          departmentId: String(dept._id),
        };
      }
    }

    return { accountId: defaultAccountId, departmentId: defaultDepartmentId };
  }

  private async resolveJitActorId(orgId: string): Promise<mongoose.Types.ObjectId> {
    const admin = await UserModel.findOne({
      org_id: orgId,
      role: "org_admin",
      is_deleted: false,
      status: "active",
    })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId } | null>();

    if (admin) {
      return admin._id;
    }
    return new mongoose.Types.ObjectId(orgId);
  }

  private toView(orgId: string, row: ISSOMapping): SsoMappingView {
    return {
      org_id: orgId,
      jit_enabled: row.jit_enabled,
      default_role: row.default_role,
      default_account_id: row.default_account_id
        ? String(row.default_account_id)
        : null,
      default_department_id: row.default_department_id
        ? String(row.default_department_id)
        : null,
      first_name_attr: row.first_name_attr ?? null,
      last_name_attr: row.last_name_attr ?? null,
      department_attr: row.department_attr ?? null,
    };
  }
}
