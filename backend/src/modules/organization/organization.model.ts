import mongoose, { Schema, type Types } from "mongoose";

/** Tenant root document (Organization = Tenant = Client). */
export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: "active" | "suspended" | "trial";
  settings: {
    timezone: string;
    locale: string;
    features: string[];
  };
  created_at: Date;
  updated_at: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "trial"],
      default: "trial",
    },
    settings: {
      timezone: { type: String, default: "UTC" },
      locale: { type: String, default: "en" },
      features: { type: [String], default: [] },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "organizations",
  },
);

organizationSchema.index({ slug: 1 }, { unique: true });

export const OrganizationModel =
  mongoose.models.Organization ??
  mongoose.model<IOrganization>("Organization", organizationSchema);
