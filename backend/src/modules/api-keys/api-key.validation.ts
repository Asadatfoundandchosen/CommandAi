import { z } from "zod";

const objectId24 = z.string().regex(/^[a-fA-F0-9]{24}$/);

export const createApiKeyBodySchema = z.object({
  name: z.string().min(1).max(128),
  account_id: objectId24.optional(),
  permissions: z.array(z.string().min(1)).min(1).max(64),
  rate_limit: z.number().int().min(1).max(1_000_000).optional().default(1000),
  expires_at: z.coerce.date().optional(),
});

export const updateApiKeyBodySchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    permissions: z.array(z.string().min(1)).min(1).max(64).optional(),
    rate_limit: z.number().int().min(1).max(1_000_000).optional(),
    expires_at: z.coerce.date().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "At least one field required");

export const apiKeyIdParamSchema = objectId24;

export const apiKeyIdParamsSchema = z.object({
  id: apiKeyIdParamSchema,
});

export const listApiKeysQuerySchema = z.object({
  account_id: objectId24.optional(),
  is_active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
