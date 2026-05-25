import { z } from "zod";

const objectIdHex = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "orgId must be a 24-char hex ObjectId");

export const oidcOrgIdParamSchema = z.object({
  orgId: objectIdHex,
});

export const upsertOrgOidcConfigBodySchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["google", "microsoft", "custom"]).optional(),
  issuer_url: z.string().url().optional(),
  client_id: z.string().min(1).max(256).optional(),
  client_secret: z.string().min(1).optional(),
  scopes: z.string().max(512).optional(),
});

export type UpsertOrgOidcConfigBody = z.infer<typeof upsertOrgOidcConfigBodySchema>;
