import { injectable } from "inversify";
import type { UpdateQuery } from "mongoose";

import type { IContract } from "./contract.model.js";
import { ContractModel } from "./contract.model.js";

function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export type CreateContractDoc = Omit<
  IContract,
  "_id" | "created_at" | "updated_at"
>;

const activeOrgScope = (orgId: string) => ({
  org_id: orgId,
  is_deleted: false,
});

@injectable()
export class ContractRepository {
  async create(data: CreateContractDoc): Promise<IContract> {
    const doc = await ContractModel.create(data);
    return doc.toObject();
  }

  async findById(id: string): Promise<IContract | null> {
    return ContractModel.findOne({ _id: id, is_deleted: false }).lean<IContract | null>();
  }

  async findByIdForOrg(id: string, orgId: string): Promise<IContract | null> {
    return ContractModel.findOne({
      _id: id,
      ...activeOrgScope(orgId),
    }).lean<IContract | null>();
  }

  async findCurrentActiveForOrg(orgId: string): Promise<IContract | null> {
    return ContractModel.findOne({
      org_id: orgId,
      status: "active",
      is_deleted: false,
    })
      .select("-internal_notes")
      .lean<IContract | null>();
  }

  async listAllActive(): Promise<IContract[]> {
    return ContractModel.find({ status: "active", is_deleted: false })
      .select("-internal_notes")
      .sort({ end_date: 1 })
      .lean<IContract[]>();
  }

  /** Active auto-renew contracts in the renewal window (up to `windowDays` before `end_date`, not yet processed). */
  async findAutoRenewExpiringWithinDays(
    now: Date,
    windowDays: number,
  ): Promise<IContract[]> {
    const windowEnd = addDaysUtc(now, windowDays);
    return ContractModel.find({
      status: "active",
      auto_renew: true,
      is_deleted: false,
      renewal_processed: false,
      end_date: { $lte: windowEnd, $gte: now },
    })
      .sort({ end_date: 1 })
      .lean<IContract[]>();
  }

  /** Active auto-renew contracts past `end_date` still pending renewal (retries / grace). */
  async findAutoRenewPastEndPending(now: Date): Promise<IContract[]> {
    return ContractModel.find({
      status: "active",
      auto_renew: true,
      is_deleted: false,
      renewal_processed: false,
      end_date: { $lt: now },
    })
      .sort({ end_date: 1 })
      .lean<IContract[]>();
  }

  /** Contracts in grace period that have exceeded `grace_period_end`. */
  async findGracePeriodExpired(now: Date): Promise<IContract[]> {
    return ContractModel.find({
      status: "active",
      is_deleted: false,
      grace_period_end: { $lte: now },
    })
      .sort({ grace_period_end: 1 })
      .lean<IContract[]>();
  }

  async listForOrg(orgId: string): Promise<IContract[]> {
    return ContractModel.find(activeOrgScope(orgId))
      .sort({ created_at: -1 })
      .lean<IContract[]>();
  }

  async listAll(): Promise<IContract[]> {
    return ContractModel.find({ is_deleted: false })
      .sort({ created_at: -1 })
      .lean<IContract[]>();
  }

  async updateById(
    id: string,
    patch: UpdateQuery<IContract>,
  ): Promise<IContract | null> {
    return ContractModel.findOneAndUpdate(
      { _id: id, is_deleted: false },
      patch,
      { new: true, runValidators: true },
    ).lean<IContract | null>();
  }

  async updateForOrg(
    id: string,
    orgId: string,
    patch: UpdateQuery<IContract>,
  ): Promise<IContract | null> {
    return ContractModel.findOneAndUpdate(
      { _id: id, ...activeOrgScope(orgId) },
      patch,
      { new: true, runValidators: true },
    ).lean<IContract | null>();
  }

  async softDelete(id: string, updatedBy: string): Promise<boolean> {
    const res = await ContractModel.findOneAndUpdate(
      { _id: id, is_deleted: false },
      { $set: { is_deleted: true, updated_by: updatedBy } },
      { new: true },
    );
    return res !== null;
  }

  async softDeleteForOrg(id: string, orgId: string, updatedBy: string): Promise<boolean> {
    const res = await ContractModel.findOneAndUpdate(
      { _id: id, ...activeOrgScope(orgId) },
      { $set: { is_deleted: true, updated_by: updatedBy } },
      { new: true },
    );
    return res !== null;
  }
}
