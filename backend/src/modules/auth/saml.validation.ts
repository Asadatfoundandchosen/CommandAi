import { z } from "zod";

const objectIdHex = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "orgId must be a 24-char hex ObjectId");

export const samlOrgIdParamSchema = z.object({
  orgId: objectIdHex,
});

const pemOrBase64Cert = z.string().min(64);

export const upsertOrgSamlConfigBodySchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["okta", "azure_ad", "onelogin", "other"]).optional(),
  idp_entity_id: z.string().max(512).optional(),
  idp_login_url: z.string().url().optional(),
  idp_logout_url: z.string().url().optional(),
  idp_certificates: z.array(pemOrBase64Cert).min(1).optional(),
  /** Raw IdP metadata XML (Okta / Azure AD / OneLogin). Parsed into URLs + certs when provided. */
  idp_metadata_xml: z.string().min(100).optional(),
  sp_certificate: pemOrBase64Cert.optional(),
  sp_private_key: z.string().min(64).optional(),
  force_authn: z.boolean().optional(),
});

export type UpsertOrgSamlConfigBody = z.infer<typeof upsertOrgSamlConfigBodySchema>;
