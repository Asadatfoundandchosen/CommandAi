import { z } from "zod";

/** Org scope from query (prefer JWT org claim in production — never trust body `org_id`). */
export const accountOrgQuerySchema = z.object({
  org_id: z.string().length(24).regex(/^[a-fA-F0-9]{24}$/, "invalid org_id"),
});

export type AccountOrgQuery = z.infer<typeof accountOrgQuerySchema>;

export const accountIdParamSchema = z.object({
  id: z.string().length(24).regex(/^[a-fA-F0-9]{24}$/, "invalid account id"),
});

/** Actor for audit fields (`created_by` / `updated_by`). Supply via `x-user-id` header. */
export const accountActorUserIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid x-user-id");

const budgetSchema = z.object({
  credit_limit: z.number(),
  allocated_credits: z.number(),
  used_credits: z.number(),
});

export const createAccountBodySchema = z.object({
  name: z.string().min(1).max(256),
  status: z.enum(["active", "inactive"]).optional(),
  budget: budgetSchema.partial().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;

export const updateAccountBodySchema = createAccountBodySchema.partial();

export type UpdateAccountBody = z.infer<typeof updateAccountBodySchema>;
