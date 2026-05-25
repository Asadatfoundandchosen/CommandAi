import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import {
  PlanLimitExceededError,
  PlanLimitsValidator,
} from "../../common/validators/plan-limits.validator.js";
import { TYPES } from "../../types.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import type { AdminAuditActor } from "../audit/admin-audit.service.js";
import type { IAccount } from "./account.model.js";
import { AccountRepository, type CreateAccountDoc } from "./account.repository.js";

export type CreateAccountInput = {
  name: string;
  status?: IAccount["status"];
  budget?: Partial<IAccount["budget"]>;
  settings?: Record<string, unknown>;
};

export type UpdateAccountInput = Partial<{
  name: string;
  status: IAccount["status"];
  budget: Partial<IAccount["budget"]>;
  settings: Record<string, unknown>;
}>;

@injectable()
export class AccountService {
  constructor(
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
    @inject(AdminAuditService)
    private readonly adminAudit: AdminAuditService,
  ) {}

  async create(
    orgId: string,
    actorUserId: string,
    input: CreateAccountInput,
    auditActor?: AdminAuditActor,
  ): Promise<IAccount> {
    await this.hierarchy.assertOrganizationExists(orgId);
    await this.planLimits.assertCanCreateAccount(orgId);
    const doc: CreateAccountDoc = {
      org_id: new mongoose.Types.ObjectId(orgId),
      name: input.name,
      status: input.status ?? "active",
      budget: {
        credit_limit: input.budget?.credit_limit ?? 0,
        allocated_credits: input.budget?.allocated_credits ?? 0,
        used_credits: input.budget?.used_credits ?? 0,
        warning_threshold: input.budget?.warning_threshold ?? 80,
      },
      settings: input.settings ?? {},
      created_by: new mongoose.Types.ObjectId(actorUserId),
      updated_by: new mongoose.Types.ObjectId(actorUserId),
      is_deleted: false,
    };
    const created = await this.accounts.create(doc);
    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.ACCOUNT_CREATED,
        orgId,
        auditActor,
        { type: "account", id: String(created._id), name: created.name },
        { after: { ...created } as unknown as Record<string, unknown> },
      );
    }
    return created;
  }

  async getById(orgId: string, id: string): Promise<IAccount | null> {
    return this.accounts.findByIdForOrg(id, orgId);
  }

  async list(orgId: string): Promise<IAccount[]> {
    return this.accounts.listForOrg(orgId);
  }

  async update(
    orgId: string,
    id: string,
    actorUserId: string,
    input: UpdateAccountInput,
    auditActor?: AdminAuditActor,
  ): Promise<IAccount | null> {
    const existing = await this.accounts.findByIdForOrg(id, orgId);
    if (!existing) {
      return null;
    }
    const setDoc: Record<string, unknown> = {
      updated_by: new mongoose.Types.ObjectId(actorUserId),
    };
    if (input.name !== undefined) {
      setDoc.name = input.name;
    }
    if (input.status !== undefined) {
      setDoc.status = input.status;
    }
    if (input.budget !== undefined) {
      setDoc.budget = {
        ...existing.budget,
        ...input.budget,
      };
    }
    if (input.settings !== undefined) {
      setDoc.settings = {
        ...existing.settings,
        ...input.settings,
      };
    }
    const updated = await this.accounts.updateForOrg(id, orgId, { $set: setDoc });
    if (updated && auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.ACCOUNT_UPDATED,
        orgId,
        auditActor,
        { type: "account", id, name: updated.name },
        {
          before: { ...existing } as unknown as Record<string, unknown>,
          after: { ...updated } as unknown as Record<string, unknown>,
        },
      );
    }
    return updated;
  }

  async remove(orgId: string, id: string, actorUserId: string): Promise<boolean> {
    return this.accounts.softDeleteForOrg(id, orgId, actorUserId);
  }
}

export { OrganizationNotFoundError } from "../../common/validators/hierarchy.validator.js";
export { PlanLimitExceededError } from "../../common/validators/plan-limits.validator.js";
