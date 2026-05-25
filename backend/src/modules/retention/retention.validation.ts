import { z } from "zod";

import { AUDIT_RETENTION_MIN_DAYS } from "./retention.constants.js";

export const upsertRetentionPolicyBodySchema = z.object({
  audit_retention_days: z.number().int().min(AUDIT_RETENTION_MIN_DAYS),
  archive_before_delete: z.boolean(),
  archive_location: z.string().trim().min(1).max(500).optional(),
});

export type UpsertRetentionPolicyBody = z.infer<typeof upsertRetentionPolicyBodySchema>;
