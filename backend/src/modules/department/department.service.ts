import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import type { AdminAuditActor } from "../audit/admin-audit.service.js";
import type { IDepartment } from "./department.model.js";
import {
  DepartmentRepository,
  type CreateDepartmentDoc,
} from "./department.repository.js";

export type CreateDepartmentInput = {
  name: string;
  description?: string;
  manager_id: string;
  status?: IDepartment["status"];
};

export type UpdateDepartmentInput = Partial<{
  name: string;
  description: string;
  manager_id: string;
  status: IDepartment["status"];
}>;

@injectable()
export class DepartmentService {
  constructor(
    @inject(TYPES.DepartmentRepository)
    private readonly departments: DepartmentRepository,
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
    @inject(AdminAuditService)
    private readonly adminAudit: AdminAuditService,
  ) {}

  async create(
    orgId: string,
    accountId: string,
    actorUserId: string,
    input: CreateDepartmentInput,
    auditActor?: AdminAuditActor,
  ): Promise<IDepartment> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    const doc: CreateDepartmentDoc = {
      org_id: new mongoose.Types.ObjectId(orgId),
      account_id: new mongoose.Types.ObjectId(accountId),
      name: input.name,
      description: input.description ?? "",
      manager_id: new mongoose.Types.ObjectId(input.manager_id),
      status: input.status ?? "active",
      created_by: new mongoose.Types.ObjectId(actorUserId),
      updated_by: new mongoose.Types.ObjectId(actorUserId),
      is_deleted: false,
    };
    const created = await this.departments.create(doc);
    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.DEPARTMENT_CREATED,
        orgId,
        auditActor,
        { type: "department", id: String(created._id), name: created.name },
        { after: { ...created } as unknown as Record<string, unknown> },
      );
    }
    return created;
  }

  async getById(
    orgId: string,
    accountId: string,
    id: string,
  ): Promise<IDepartment | null> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    return this.departments.findByIdForScope(id, orgId, accountId);
  }

  async list(orgId: string, accountId: string): Promise<IDepartment[]> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    return this.departments.listForScope(orgId, accountId);
  }

  async update(
    orgId: string,
    accountId: string,
    id: string,
    actorUserId: string,
    input: UpdateDepartmentInput,
    auditActor?: AdminAuditActor,
  ): Promise<IDepartment | null> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    const existing = await this.departments.findByIdForScope(id, orgId, accountId);
    if (!existing) {
      return null;
    }
    const setDoc: Record<string, unknown> = {
      updated_by: new mongoose.Types.ObjectId(actorUserId),
    };
    if (input.name !== undefined) {
      setDoc.name = input.name;
    }
    if (input.description !== undefined) {
      setDoc.description = input.description;
    }
    if (input.manager_id !== undefined) {
      setDoc.manager_id = new mongoose.Types.ObjectId(input.manager_id);
    }
    if (input.status !== undefined) {
      setDoc.status = input.status;
    }
    const updated = await this.departments.updateForScope(id, orgId, accountId, {
      $set: setDoc,
    });
    if (updated && auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.DEPARTMENT_UPDATED,
        orgId,
        auditActor,
        { type: "department", id, name: updated.name },
        {
          before: { ...existing } as unknown as Record<string, unknown>,
          after: { ...updated } as unknown as Record<string, unknown>,
        },
      );
    }
    return updated;
  }

  async remove(
    orgId: string,
    accountId: string,
    id: string,
    actorUserId: string,
  ): Promise<boolean> {
    await this.hierarchy.assertAccountBelongsToOrg(accountId, orgId);
    return this.departments.softDeleteForScope(id, orgId, accountId, actorUserId);
  }
}

export { AccountNotInOrganizationError } from "../../common/validators/hierarchy.validator.js";
