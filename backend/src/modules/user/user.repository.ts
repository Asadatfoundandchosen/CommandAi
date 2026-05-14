import { injectable } from "inversify";
import mongoose from "mongoose";
import type { UpdateQuery } from "mongoose";

import type { IUser, IUserPublic } from "./user.model.js";
import { UserModel } from "./user.model.js";

export type CreateUserDoc = Omit<
  IUser,
  "_id" | "created_at" | "updated_at"
>;

const activeDeptScope = (
  orgId: string,
  accountId: string,
  departmentId: string,
) => ({
  org_id: orgId,
  account_id: accountId,
  department_id: departmentId,
  is_deleted: false,
});

function asPublic(doc: IUser): IUserPublic {
  const { password_hash: _, ...rest } = doc;
  return rest;
}

@injectable()
export class UserRepository {
  async create(data: CreateUserDoc): Promise<IUserPublic> {
    const doc = await UserModel.create(data);
    const obj = doc.toObject({ virtuals: false });
    return asPublic(obj as IUser);
  }

  async findByIdForScope(
    id: string,
    orgId: string,
    accountId: string,
    departmentId: string,
  ): Promise<IUserPublic | null> {
    const row = await UserModel.findOne({
      _id: id,
      ...activeDeptScope(orgId, accountId, departmentId),
    }).lean<IUser | null>();
    return row ? asPublic(row) : null;
  }

  async listForDepartment(
    orgId: string,
    accountId: string,
    departmentId: string,
  ): Promise<IUserPublic[]> {
    const rows = await UserModel.find(activeDeptScope(orgId, accountId, departmentId))
      .sort({ created_at: -1 })
      .lean<IUser[]>();
    return rows.map(asPublic);
  }

  async updateForScope(
    id: string,
    orgId: string,
    accountId: string,
    departmentId: string,
    patch: UpdateQuery<IUser>,
  ): Promise<IUserPublic | null> {
    const row = await UserModel.findOneAndUpdate(
      { _id: id, ...activeDeptScope(orgId, accountId, departmentId) },
      patch,
      { new: true, runValidators: true },
    ).lean<IUser | null>();
    return row ? asPublic(row) : null;
  }

  /**
   * Active users per department id (for tenant hierarchy dashboard).
   * Keys are 24-char hex department ObjectIds.
   */
  async countActiveUsersByDepartmentForOrg(orgId: string): Promise<Map<string, number>> {
    const oid = new mongoose.Types.ObjectId(orgId);
    const rows = await UserModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { org_id: oid, is_deleted: false } },
      { $group: { _id: "$department_id", count: { $sum: 1 } } },
    ]);
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r._id) {
        map.set(String(r._id), r.count);
      }
    }
    return map;
  }

  async softDeleteForScope(
    id: string,
    orgId: string,
    accountId: string,
    departmentId: string,
    updatedBy: string,
  ): Promise<boolean> {
    const res = await UserModel.findOneAndUpdate(
      { _id: id, ...activeDeptScope(orgId, accountId, departmentId) },
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
