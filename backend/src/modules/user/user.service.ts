import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import {
  PlanLimitExceededError,
  PlanLimitsValidator,
} from "../../common/validators/plan-limits.validator.js";
import { TYPES } from "../../types.js";
import { AuthService } from "../auth/auth.service.js";
import { PasswordService } from "../auth/password.service.js";
import { PermissionCacheService } from "../rbac/permission-cache.service.js";
import { SearchService } from "../search/search.service.js";
import type { IUserPublic } from "./user.model.js";
import { UserRepository, type CreateUserDoc } from "./user.repository.js";

export type CreateUserInput = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: CreateUserDoc["role"];
  status?: CreateUserDoc["status"];
  mfa_enabled?: boolean;
};

export type UpdateUserInput = Partial<{
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: CreateUserDoc["role"];
  status: CreateUserDoc["status"];
  mfa_enabled: boolean;
}>;

@injectable()
export class UserService {
  constructor(
    @inject(TYPES.UserRepository) private readonly users: UserRepository,
    @inject(TYPES.HierarchyValidator) private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.SearchService) private readonly search: SearchService,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
    @inject(TYPES.AuthService) private readonly auth: AuthService,
    @inject(TYPES.PasswordService) private readonly passwords: PasswordService,
    @inject(PermissionCacheService)
    private readonly permissionCache: PermissionCacheService,
  ) {}

  private passwordUserInputs(
    email: string,
    firstName: string,
    lastName: string,
  ): string[] {
    return [email, firstName, lastName, email.split("@")[0] ?? ""];
  }

  async create(
    orgId: string,
    accountId: string,
    departmentId: string,
    actorUserId: string,
    input: CreateUserInput,
  ): Promise<IUserPublic> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    await this.planLimits.assertCanCreateUser(orgId);
    const email = input.email.trim().toLowerCase();
    const firstName = input.first_name.trim();
    const lastName = input.last_name.trim();
    this.passwords.assertPasswordStrength(
      input.password,
      this.passwordUserInputs(email, firstName, lastName),
    );
    const password_hash = await this.passwords.hashPassword(input.password);
    const doc: CreateUserDoc = {
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: new mongoose.Types.ObjectId(accountId),
      department_id: new mongoose.Types.ObjectId(departmentId),
      email,
      password_hash,
      first_name: firstName,
      last_name: lastName,
      role: input.role,
      status: input.status ?? "pending",
      mfa_enabled: input.mfa_enabled ?? false,
      password_change_required: false,
      last_login: null,
      created_by: new mongoose.Types.ObjectId(actorUserId),
      updated_by: new mongoose.Types.ObjectId(actorUserId),
      is_deleted: false,
    };
    const user = await this.users.create(doc);
    await this.syncSearch(user).catch(() => undefined);
    return user;
  }

  async list(
    orgId: string,
    accountId: string,
    departmentId: string,
  ): Promise<IUserPublic[]> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    return this.users.listForDepartment(orgId, accountId, departmentId);
  }

  async getById(
    orgId: string,
    accountId: string,
    departmentId: string,
    id: string,
  ): Promise<IUserPublic | null> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    return this.users.findByIdForScope(id, orgId, accountId, departmentId);
  }

  async update(
    orgId: string,
    accountId: string,
    departmentId: string,
    id: string,
    actorUserId: string,
    input: UpdateUserInput,
  ): Promise<IUserPublic | null> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    const existing = await this.users.findByIdForScope(
      id,
      orgId,
      accountId,
      departmentId,
    );
    if (!existing) {
      return null;
    }
    const setDoc: Record<string, unknown> = {
      updated_by: new mongoose.Types.ObjectId(actorUserId),
    };
    if (input.email !== undefined) {
      setDoc.email = input.email.trim().toLowerCase();
    }
    if (input.password !== undefined) {
      const emailForCheck =
        (input.email ?? existing.email).trim().toLowerCase();
      const firstForCheck = (input.first_name ?? existing.first_name).trim();
      const lastForCheck = (input.last_name ?? existing.last_name).trim();
      this.passwords.assertPasswordStrength(
        input.password,
        this.passwordUserInputs(emailForCheck, firstForCheck, lastForCheck),
      );
      setDoc.password_hash = await this.passwords.hashPassword(input.password);
      setDoc.password_change_required = false;
    }
    if (input.first_name !== undefined) {
      setDoc.first_name = input.first_name.trim();
    }
    if (input.last_name !== undefined) {
      setDoc.last_name = input.last_name.trim();
    }
    if (input.role !== undefined) {
      setDoc.role = input.role;
    }
    if (input.status !== undefined) {
      setDoc.status = input.status;
    }
    if (input.mfa_enabled !== undefined) {
      setDoc.mfa_enabled = input.mfa_enabled;
    }
    const next = await this.users.updateForScope(id, orgId, accountId, departmentId, {
      $set: setDoc,
    });
    if (next) {
      if (input.role !== undefined && input.role !== existing.role) {
        await this.permissionCache.invalidate(id).catch(() => undefined);
      }
      if (input.password !== undefined) {
        await this.auth
          .revokeAllUserTokensOnPasswordChange(id)
          .catch(() => undefined);
      }
      await this.syncSearch(next).catch(() => undefined);
    }
    return next;
  }

  async remove(
    orgId: string,
    accountId: string,
    departmentId: string,
    id: string,
    actorUserId: string,
  ): Promise<boolean> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    return this.users.softDeleteForScope(
      id,
      orgId,
      accountId,
      departmentId,
      actorUserId,
    );
  }

  /** Full-text search index (best-effort). */
  private async syncSearch(user: IUserPublic): Promise<void> {
    await this.search.indexUser({
      orgId: String(user.org_id),
      userId: String(user._id),
      email: user.email,
      displayName: `${user.first_name} ${user.last_name}`.trim(),
    });
  }
}

export {
  AccountNotInOrganizationError,
  DepartmentNotInAccountError,
} from "../../common/validators/hierarchy.validator.js";
export { PlanLimitExceededError } from "../../common/validators/plan-limits.validator.js";
