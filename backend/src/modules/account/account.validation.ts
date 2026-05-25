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
  warning_threshold: z.number().int().min(1).max(100).optional(),
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

/** Body for `POST /api/v1/accounts/:id/allocate` — move credits from org pool to account. */
export const allocateCreditsBodySchema = z.object({
  amount: z.number().int().positive().max(1_000_000_000),
  description: z.string().min(1).max(512).optional(),
});

export type AllocateCreditsBody = z.infer<typeof allocateCreditsBodySchema>;

/** Body for `POST /api/v1/accounts/:id/budget/allocate`. */
export const allocateBudgetBodySchema = allocateCreditsBodySchema;
export type AllocateBudgetBody = z.infer<typeof allocateBudgetBodySchema>;

/** Body for `PATCH /api/v1/accounts/:id/budget/limit`. */
export const patchAccountBudgetLimitBodySchema = z
  .object({
    limit: z.number().int().min(0).max(1_000_000_000).optional(),
    warning_threshold: z.number().int().min(1).max(100).optional(),
  })
  .refine((v) => v.limit !== undefined || v.warning_threshold !== undefined, {
    message: "At least one of limit or warning_threshold is required",
  });

export type PatchAccountBudgetLimitBody = z.infer<
  typeof patchAccountBudgetLimitBodySchema
>;
