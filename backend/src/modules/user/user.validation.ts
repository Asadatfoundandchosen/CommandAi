import { z } from "zod";

const objectId24 = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid ObjectId");

/** Hierarchy scope from query / headers (never trust body for these ids). */
export const userScopeQuerySchema = z.object({
  org_id: objectId24,
  account_id: objectId24,
  department_id: objectId24,
});

export type UserScopeQuery = z.infer<typeof userScopeQuerySchema>;

export const userIdParamSchema = z.object({
  id: objectId24,
});

export const userActorUserIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid x-user-id");

export const createUserBodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  first_name: z.string().min(1).max(128),
  last_name: z.string().min(1).max(128),
  role: z.enum(["org_admin", "account_admin", "dept_manager", "dept_user"]),
  status: z.enum(["active", "inactive", "pending"]).optional(),
  mfa_enabled: z.boolean().optional(),
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = createUserBodySchema
  .omit({ password: true })
  .partial()
  .extend({
    password: z.string().min(8).max(128).optional(),
    email: z.string().email().max(320).optional(),
  });

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
