import {
  mongooseFieldEncryptionPlugin,
  ORG_ENCRYPTED_FIELDS,
} from "@common/encryption/mongoose-field-encryption.plugin.js";
import mongoose, { Schema, type Types } from "mongoose";

import type { PlanTier } from "../../config/plans.js";
import type { StripePlanKey } from "../billing/stripe-plans.js";

/** Enterprise SAML 2.0 IdP configuration (Okta, Azure AD, OneLogin, etc.). */
export type OrgSamlProvider = "okta" | "azure_ad" | "onelogin" | "other";

/** Enterprise OIDC SSO (Google, Microsoft Entra ID, custom providers). */
export type OrgOidcProvider = "google" | "microsoft" | "custom";

export type OrgOidcConfig = {
  enabled: boolean;
  provider?: OrgOidcProvider;
  issuer_url: string;
  client_id: string;
  client_secret_enc?: string;
  scopes?: string;
};

export type OrgSamlConfig = {
  enabled: boolean;
  provider?: OrgSamlProvider;
  idp_entity_id?: string;
  idp_login_url: string;
  idp_logout_url?: string;
  idp_certificates: string[];
  /** Raw IdP metadata XML stored for audit / re-parse. */
  idp_metadata_xml?: string;
  sp_certificate?: string;
  sp_private_key_enc?: string;
  force_authn?: boolean;
};

/** Tenant root document (Organization = Tenant = Client). */
export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: "active" | "suspended" | "trial";
  /** Billing contact for Stripe Customer. */
  billing_email?: string;
  billing?: {
    allocated_credits: number;
    used_credits: number;
  };
  /** Active subscription tier and billing cycle (synced from Stripe or plan change). */
  subscription?: {
    tier: PlanTier;
    billing_cycle?: "monthly" | "annual";
  };
  /** Stripe Customer / Subscription IDs and synced catalog price map. */
  stripe?: {
    customer_id?: string;
    subscription_id?: string;
    price_id?: string;
    plan_key?: StripePlanKey;
    product_ids?: Partial<Record<StripePlanKey, string>>;
    price_ids?: Partial<Record<StripePlanKey, string>>;
  };
  settings: {
    timezone: string;
    locale: string;
    features: string[];
  };
  saml?: OrgSamlConfig;
  oidc?: OrgOidcConfig;
  /** SSO policy (enforce IdP login, etc.). */
  sso_settings?: {
    enforce: boolean;
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
    billing_email: { type: String, trim: true, lowercase: true },
    billing: {
      allocated_credits: { type: Number, default: 0, min: 0 },
      used_credits: { type: Number, default: 0, min: 0 },
    },
    subscription: {
      tier: {
        type: String,
        enum: ["starter", "pro", "enterprise"],
        default: "starter",
      },
      billing_cycle: {
        type: String,
        enum: ["monthly", "annual"],
      },
    },
    stripe: {
      customer_id: { type: String, trim: true },
      subscription_id: { type: String, trim: true },
      price_id: { type: String, trim: true },
      plan_key: { type: String, trim: true },
      product_ids: { type: Schema.Types.Mixed, default: {} },
      price_ids: { type: Schema.Types.Mixed, default: {} },
    },
    settings: {
      timezone: { type: String, default: "UTC" },
      locale: { type: String, default: "en" },
      features: { type: [String], default: [] },
    },
    saml: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["okta", "azure_ad", "onelogin", "other"],
      },
      idp_entity_id: { type: String },
      idp_login_url: { type: String },
      idp_logout_url: { type: String },
      idp_certificates: { type: [String], default: [] },
      idp_metadata_xml: { type: String, select: false },
      sp_certificate: { type: String },
      sp_private_key_enc: { type: String, select: false },
      force_authn: { type: Boolean, default: true },
    },
    oidc: {
      enabled: { type: Boolean, default: false },
      provider: {
        type: String,
        enum: ["google", "microsoft", "custom"],
      },
      issuer_url: { type: String },
      client_id: { type: String },
      client_secret_enc: { type: String, select: false },
      scopes: { type: String, default: "openid profile email" },
    },
    sso_settings: {
      enforce: { type: Boolean, default: false },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    collection: "organizations",
  },
);

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ "stripe.customer_id": 1 }, { sparse: true });

organizationSchema.plugin(mongooseFieldEncryptionPlugin, {
  fields: ORG_ENCRYPTED_FIELDS,
});

export const OrganizationModel =
  mongoose.models.Organization ??
  mongoose.model<IOrganization>("Organization", organizationSchema);
