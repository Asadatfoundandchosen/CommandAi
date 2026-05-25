import { z } from "zod";

const mfaRequiredFor = z.enum(["all", "admins", "none"]);
const mfaAllowedMethod = z.enum(["totp", "sms", "email", "webauthn"]);

export const upsertMfaPolicyBodySchema = z.object({
  enabled: z.boolean(),
  required_for: mfaRequiredFor,
  grace_period_days: z.number().int().min(0).max(90),
  allowed_methods: z.array(mfaAllowedMethod).min(1).max(4),
  enforcement_date: z.string().datetime().optional(),
});

export type UpsertMfaPolicyBody = z.infer<typeof upsertMfaPolicyBodySchema>;
