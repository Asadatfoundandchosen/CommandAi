import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import { HierarchyValidator } from "../../common/validators/hierarchy.validator.js";
import { TYPES } from "../../types.js";
import { toCurrentContractResponse, type CurrentContractResponse } from "./contract.dto.js";
import type { IContract } from "./contract.model.js";
import { ContractRepository, type CreateContractDoc } from "./contract.repository.js";
import {
  assertMergedContractDates,
  createContractBodySchema,
  updateContractBodySchema,
  type CreateContractBody,
  type UpdateContractBody,
} from "./contract.validation.js";

export type CreateContractInput = CreateContractBody;
export type UpdateContractInput = UpdateContractBody;

@injectable()
export class ContractService {
  constructor(
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
    @inject(TYPES.HierarchyValidator)
    private readonly hierarchy: HierarchyValidator,
  ) {}

  async create(actorUserId: string, input: CreateContractInput): Promise<IContract> {
    const body = createContractBodySchema.parse(input);
    await this.hierarchy.assertOrganizationExists(body.org_id);

    const doc: CreateContractDoc = {
      org_id: new mongoose.Types.ObjectId(body.org_id),
      contract_number: body.contract_number,
      status: body.status ?? "draft",
      type: body.type,
      start_date: body.start_date,
      end_date: body.end_date,
      auto_renew: body.auto_renew ?? false,
      billing: body.billing,
      credits: body.credits,
      created_by: new mongoose.Types.ObjectId(actorUserId),
      updated_by: new mongoose.Types.ObjectId(actorUserId),
      is_deleted: false,
    };
    return this.contracts.create(doc);
  }

  /** Org-admin read-only view of the active agreement (no `internal_notes`). */
  async getCurrentContract(orgId: string): Promise<CurrentContractResponse> {
    const contract = await this.contracts.findCurrentActiveForOrg(orgId);
    return toCurrentContractResponse(contract);
  }

  async getById(id: string): Promise<IContract | null> {
    return this.contracts.findById(id);
  }

  async getByIdForOrg(orgId: string, id: string): Promise<IContract | null> {
    return this.contracts.findByIdForOrg(id, orgId);
  }

  async list(orgId?: string): Promise<IContract[]> {
    if (orgId) {
      return this.contracts.listForOrg(orgId);
    }
    return this.contracts.listAll();
  }

  async update(
    id: string,
    actorUserId: string,
    input: UpdateContractInput,
    orgId?: string,
  ): Promise<IContract | null> {
    const body = updateContractBodySchema.parse(input);
    const existing = orgId
      ? await this.contracts.findByIdForOrg(id, orgId)
      : await this.contracts.findById(id);
    if (!existing) {
      return null;
    }

    if (body.start_date !== undefined || body.end_date !== undefined) {
      assertMergedContractDates(existing, {
        start_date: body.start_date,
        end_date: body.end_date,
      });
    }

    const setDoc: Record<string, unknown> = {
      updated_by: new mongoose.Types.ObjectId(actorUserId),
    };
    if (body.contract_number !== undefined) {
      setDoc.contract_number = body.contract_number;
    }
    if (body.status !== undefined) {
      setDoc.status = body.status;
    }
    if (body.type !== undefined) {
      setDoc.type = body.type;
    }
    if (body.start_date !== undefined) {
      setDoc.start_date = body.start_date;
    }
    if (body.end_date !== undefined) {
      setDoc.end_date = body.end_date;
    }
    if (body.auto_renew !== undefined) {
      setDoc.auto_renew = body.auto_renew;
    }
    if (body.billing !== undefined) {
      setDoc.billing = { ...existing.billing, ...body.billing };
    }
    if (body.credits !== undefined) {
      setDoc.credits = { ...existing.credits, ...body.credits };
    }

    if (Object.keys(setDoc).length === 1) {
      return existing;
    }

    return orgId
      ? this.contracts.updateForOrg(id, orgId, { $set: setDoc })
      : this.contracts.updateById(id, { $set: setDoc });
  }

  async remove(id: string, actorUserId: string, orgId?: string): Promise<boolean> {
    return orgId
      ? this.contracts.softDeleteForOrg(id, orgId, actorUserId)
      : this.contracts.softDelete(id, actorUserId);
  }
}

export { OrganizationNotFoundError } from "../../common/validators/hierarchy.validator.js";
export { ContractValidationError } from "./contract.validation.js";
