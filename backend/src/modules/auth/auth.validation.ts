import { z } from "zod";

const totpCodeField = z
  .string()
  .regex(/^\d{6}$/, "TOTP code must be 6 digits");

export const loginBodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
  org_id: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "org_id must be a 24-char hex ObjectId")
    .optional(),
  /** Required when `mfa_enabled` is true for the account. */
  totp_code: totpCodeField.optional(),
  backup_code: z.string().min(8).max(32).optional(),
  sms_code: totpCodeField.optional(),
});

export const mfaTotpVerifyBodySchema = z.object({
  token: totpCodeField,
});

export const mfaTotpDisableBodySchema = z.object({
  token: z.union([totpCodeField, z.string().min(8).max(32)]),
});

export const mfaBackupCodesRegenerateBodySchema = z.object({
  token: totpCodeField,
});

const e164Phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "phone_number must be E.164 format (e.g. +14155552671)");

export const smsMfaSendBodySchema = z.object({
  phone_number: e164Phone,
});

export const smsMfaVerifyBodySchema = z.object({
  code: totpCodeField,
});

export const smsMfaSendLoginBodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
  org_id: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "org_id must be a 24-char hex ObjectId")
    .optional(),
});

export const magicLinkSendBodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  org_id: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "org_id must be a 24-char hex ObjectId")
    .optional(),
});

export const magicLinkVerifyBodySchema = z.object({
  token: z.string().min(32).max(128),
  totp_code: totpCodeField.optional(),
  backup_code: z.string().min(8).max(32).optional(),
  sms_code: totpCodeField.optional(),
});

export const refreshBodySchema = z.object({
  /** Optional when `refresh_token` httpOnly cookie is set. */
  refreshToken: z.string().min(1).optional(),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const objectIdHex = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "must be a 24-char hex ObjectId");

export const revokeAllTokensBodySchema = z.object({
  /** Target user (org_admin only). Defaults to the caller's JWT `sub`. */
  user_id: objectIdHex.optional(),
});

const sessionIdUuid = z
  .string()
  .uuid("session id must be a UUID");

export const sessionIdParamSchema = z.object({
  id: sessionIdUuid,
});
