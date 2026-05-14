import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import { SearchService } from "../search/search.service.js";
import { hashPassword } from "./user.password.js";
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
  ) {}

  async create(
    orgId: string,
    accountId: string,
    departmentId: string,
    actorUserId: string,
    input: CreateUserInput,
  ): Promise<IUserPublic> {
    await this.hierarchy.assertUserHierarchy(orgId, accountId, departmentId);
    const email = input.email.trim().toLowerCase();
    const doc: CreateUserDoc = {
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: new mongoose.Types.ObjectId(accountId),
      department_id: new mongoose.Types.ObjectId(departmentId),
      email,
      password_hash: hashPassword(input.password),
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      role: input.role,
      status: input.status ?? "pending",
      mfa_enabled: input.mfa_enabled ?? false,
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
      setDoc.password_hash = hashPassword(input.password);
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
