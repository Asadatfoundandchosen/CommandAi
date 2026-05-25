import { z } from "zod";

const objectId24 = z.string().regex(/^[a-fA-F0-9]{24}$/);

export const upsertScimConfigBodySchema = z.object({
  enabled: z.boolean(),
  default_role: z
    .enum(["org_admin", "account_admin", "dept_manager", "dept_user"])
    .optional(),
  default_account_id: objectId24,
  default_department_id: objectId24,
  rotate_token: z.boolean().optional(),
});
