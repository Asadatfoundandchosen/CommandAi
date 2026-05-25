import { z } from "zod";

const objectId24 = z.string().regex(/^[a-fA-F0-9]{24}$/);

export const upsertSsoMappingBodySchema = z.object({
  jit_enabled: z.boolean(),
  default_role: z
    .enum(["org_admin", "account_admin", "dept_manager", "dept_user"])
    .optional(),
  default_account_id: objectId24.optional(),
  default_department_id: objectId24.optional(),
  first_name_attr: z.string().max(256).optional(),
  last_name_attr: z.string().max(256).optional(),
  department_attr: z.string().max(256).optional(),
});

export type UpsertSsoMappingBody = z.infer<typeof upsertSsoMappingBodySchema>;
