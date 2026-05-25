import { injectable } from "inversify";
import type { UpdateQuery } from "mongoose";

import type { IAccount } from "./account.model.js";
import { AccountModel } from "./account.model.js";

export type CreateAccountDoc = Omit<
  IAccount,
  "_id" | "created_at" | "updated_at"
>;

const activeOrgScope = (orgId: string) => ({
  org_id: orgId,
  is_deleted: false,
});

@injectable()
export class AccountRepository {
  async create(data: CreateAccountDoc): Promise<IAccount> {
    const doc = await AccountModel.create(data);
    return doc.toObject();
  }

  async findByIdForOrg(id: string, orgId: string): Promise<IAccount | null> {
    return AccountModel.findOne({
      _id: id,
      ...activeOrgScope(orgId),
    }).lean<IAccount | null>();
  }

  async countActiveForOrg(orgId: string): Promise<number> {
    return AccountModel.countDocuments(activeOrgScope(orgId));
  }

  async listForOrg(orgId: string): Promise<IAccount[]> {
    return AccountModel.find(activeOrgScope(orgId))
      .sort({ created_at: -1 })
      .lean<IAccount[]>();
  }

  async updateForOrg(
    id: string,
    orgId: string,
    patch: UpdateQuery<IAccount>,
  ): Promise<IAccount | null> {
    return AccountModel.findOneAndUpdate(
      { _id: id, ...activeOrgScope(orgId) },
      patch,
      { new: true, runValidators: true },
    ).lean<IAccount | null>();
  }

  async softDeleteForOrg(id: string, orgId: string, updatedBy: string): Promise<boolean> {
    const res = await AccountModel.findOneAndUpdate(
      { _id: id, ...activeOrgScope(orgId) },
      { $set: { is_deleted: true, updated_by: updatedBy } },
      { new: true },
    );
    return res !== null;
  }
}
