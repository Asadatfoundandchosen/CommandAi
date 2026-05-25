import mongoose, { Schema, type Types } from "mongoose";

/** IdP-provisioned group (SCIM Groups resource). */
export interface IScimGroup {
  _id: Types.ObjectId;
  org_id: Types.ObjectId;
  display_name: string;
  /** IdP external identifier (SCIM externalId). */
  external_id?: string;
  /** Member user ObjectIds (hex strings in API layer). */
  members: Types.ObjectId[];
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

const scimGroupSchema = new Schema<IScimGroup>(
  {
    org_id: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Organization",
      index: true,
    },
    display_name: { type: String, required: true, trim: true },
    external_id: { type: String, trim: true },
    members: { type: [Schema.Types.ObjectId], default: [] },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "scim_groups",
  },
);

scimGroupSchema.index(
  { org_id: 1, external_id: 1 },
  { unique: true, sparse: true, partialFilterExpression: { is_deleted: false } },
);

export const ScimGroupModel =
  mongoose.models.ScimGroup ??
  mongoose.model<IScimGroup>("ScimGroup", scimGroupSchema);
