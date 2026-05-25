import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a 24-char hex ObjectId");

const auditFilterFieldsSchema = z.object({
  q: z.string().trim().min(1).max(500).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  actor_id: objectIdSchema.optional(),
  action: z.string().trim().min(1).max(200).optional(),
  resource_type: z.string().trim().min(1).max(120).optional(),
  resource_id: objectIdSchema.optional(),
});

export const auditSearchQuerySchema = auditFilterFieldsSchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  include_aggs: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

export const auditExportBodySchema = auditFilterFieldsSchema.extend({
  format: z.enum(["csv", "json"]).optional().default("csv"),
  email: z.string().trim().email().optional(),
});

export type AuditSearchQuery = z.infer<typeof auditSearchQuerySchema>;
export type AuditExportBody = z.infer<typeof auditExportBodySchema>;

function parseOptionalDate(value: string | undefined, field: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${field} date`);
  }
  return d;
}

export function toAuditSearchParams(query: AuditSearchQuery): {
  q?: string;
  from?: Date;
  to?: Date;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  page: number;
  limit: number;
  include_aggs?: boolean;
} {
  const filters = toAuditExportFilters(query);
  return {
    ...filters,
    page: query.page,
    limit: query.limit,
    ...(query.include_aggs !== undefined ? { include_aggs: query.include_aggs } : {}),
  };
}

export function toAuditExportFilters(
  query: z.infer<typeof auditFilterFieldsSchema>,
): {
  q?: string;
  from?: Date;
  to?: Date;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
} {
  return {
    ...(query.q !== undefined ? { q: query.q } : {}),
    from: parseOptionalDate(query.from, "from"),
    to: parseOptionalDate(query.to, "to"),
    ...(query.actor_id !== undefined ? { actor_id: query.actor_id } : {}),
    ...(query.action !== undefined ? { action: query.action } : {}),
    ...(query.resource_type !== undefined ? { resource_type: query.resource_type } : {}),
    ...(query.resource_id !== undefined ? { resource_id: query.resource_id } : {}),
  };
}

export function toAuditExportParams(body: AuditExportBody): {
  format: "csv" | "json";
  email?: string;
  q?: string;
  from?: Date;
  to?: Date;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
} {
  const filters = toAuditExportFilters(body);
  return {
    format: body.format,
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...filters,
  };
}
