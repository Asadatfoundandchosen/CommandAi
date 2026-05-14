import { injectable } from "inversify";
import type { UpdateQuery } from "mongoose";

import type { IOrganization } from "./organization.model.js";
import { OrganizationModel } from "./organization.model.js";

export type CreateOrganizationDoc = Omit<
  IOrganization,
  "_id" | "created_at" | "updated_at"
>;

@injectable()
export class OrganizationRepository {
  async create(data: CreateOrganizationDoc): Promise<IOrganization> {
    const doc = await OrganizationModel.create(data);
    return doc.toObject();
  }

  async findById(id: string): Promise<IOrganization | null> {
    return OrganizationModel.findById(id).lean<IOrganization | null>();
  }

  async findBySlug(slug: string): Promise<IOrganization | null> {
    return OrganizationModel.findOne({ slug }).lean<IOrganization | null>();
  }

  async list(): Promise<IOrganization[]> {
    return OrganizationModel.find()
      .sort({ created_at: -1 })
      .lean<IOrganization[]>();
  }

  async updateById(
    id: string,
    patch: UpdateQuery<IOrganization>,
  ): Promise<IOrganization | null> {
    return OrganizationModel.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    }).lean<IOrganization | null>();
  }

  async deleteById(id: string): Promise<boolean> {
    const res = await OrganizationModel.findByIdAndDelete(id);
    return res !== null;
  }
}
