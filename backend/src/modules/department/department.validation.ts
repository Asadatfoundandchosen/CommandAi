import { z } from "zod";

const objectId24 = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid ObjectId");

/** Org + account scope from query / headers (never trust body for these ids). */
export const departmentScopeQuerySchema = z.object({
  org_id: objectId24,
  account_id: objectId24,
});

export type DepartmentScopeQuery = z.infer<typeof departmentScopeQuerySchema>;

export const departmentIdParamSchema = z.object({
  id: objectId24,
});

/** Actor for `created_by` / `updated_by` via `x-user-id`. */
export const departmentActorUserIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid x-user-id");

export const createDepartmentBodySchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(8000).optional(),
  manager_id: objectId24,
  status: z.enum(["active", "inactive"]).optional(),
});

export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;

export const updateDepartmentBodySchema = createDepartmentBodySchema.partial();

export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>;
