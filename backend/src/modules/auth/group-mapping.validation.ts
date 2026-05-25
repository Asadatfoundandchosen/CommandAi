import { z } from "zod";

const objectId24 = z.string().regex(/^[a-fA-F0-9]{24}$/);

const mappingEntrySchema = z.object({
  idp_group: z.string().min(1).max(512),
  role: z.enum(["org_admin", "account_admin", "dept_manager", "dept_user"]),
  account_id: objectId24.optional(),
  department_id: objectId24.optional(),
});

export const upsertGroupMappingBodySchema = z.object({
  enabled: z.boolean(),
  fallback_role: z
    .enum(["org_admin", "account_admin", "dept_manager", "dept_user"])
    .optional(),
  mappings: z.array(mappingEntrySchema).max(100).optional(),
});

export type UpsertGroupMappingBody = z.infer<typeof upsertGroupMappingBodySchema>;
