import { z } from "zod";

export const upsertSsoEnforcementBodySchema = z.object({
  enforce: z.boolean(),
});

export const grantEmergencyAccessBodySchema = z.object({
  user_id: z.string().regex(/^[a-fA-F0-9]{24}$/),
  ttl_hours: z.number().int().min(1).max(168).optional(),
});

export const ssoLoginOptionsQuerySchema = z.object({
  email: z.string().email(),
  org_id: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .optional(),
});
