import { injectable } from "inversify";
import type { UpdateQuery } from "mongoose";

import type { IDepartment } from "./department.model.js";
import { DepartmentModel } from "./department.model.js";

export type CreateDepartmentDoc = Omit<
  IDepartment,
  "_id" | "created_at" | "updated_at"
>;

const activeScope = (orgId: string, accountId: string) => ({
  org_id: orgId,
  account_id: accountId,
  is_deleted: false,
});

@injectable()
export class DepartmentRepository {
  async create(data: CreateDepartmentDoc): Promise<IDepartment> {
    const doc = await DepartmentModel.create(data);
    return doc.toObject();
  }

  async findByIdForScope(
    id: string,
    orgId: string,
    accountId: string,
  ): Promise<IDepartment | null> {
    return DepartmentModel.findOne({
      _id: id,
      ...activeScope(orgId, accountId),
    }).lean<IDepartment | null>();
  }

  async listForScope(orgId: string, accountId: string): Promise<IDepartment[]> {
    return DepartmentModel.find(activeScope(orgId, accountId))
      .sort({ created_at: -1 })
      .lean<IDepartment[]>();
  }

  async updateForScope(
    id: string,
    orgId: string,
    accountId: string,
    patch: UpdateQuery<IDepartment>,
  ): Promise<IDepartment | null> {
    return DepartmentModel.findOneAndUpdate(
      { _id: id, ...activeScope(orgId, accountId) },
      patch,
      { new: true, runValidators: true },
    ).lean<IDepartment | null>();
  }

  async softDeleteForScope(
    id: string,
    orgId: string,
    accountId: string,
    updatedBy: string,
  ): Promise<boolean> {
    const res = await DepartmentModel.findOneAndUpdate(
      { _id: id, ...activeScope(orgId, accountId) },
      {
        $set: {
          is_deleted: true,
          updated_by: updatedBy,
        },
      },
      { new: true },
    );
    return res !== null;
  }
}
