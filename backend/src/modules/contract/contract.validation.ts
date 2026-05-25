import { z } from "zod";

const objectIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-fA-F0-9]{24}$/, "invalid ObjectId");

const nonNegativeAmount = z.number().finite().min(0, "amount must be >= 0");

const billingSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
  billing_cycle: z.enum(["monthly", "annual"]),
  amount: nonNegativeAmount,
  currency: z
    .string()
    .trim()
    .length(3, "currency must be a 3-letter ISO code")
    .regex(/^[A-Za-z]{3}$/, "currency must be alphabetic")
    .transform((c) => c.toUpperCase()),
});

const creditsSchema = z.object({
  initial_allocation: nonNegativeAmount,
  renewal_allocation: nonNegativeAmount,
});

const dateInputSchema = z.coerce.date();

export class ContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractValidationError";
  }
}

/** Ensures end_date is strictly after start_date. */
export function assertContractDateRange(startDate: Date, endDate: Date): void {
  if (endDate.getTime() <= startDate.getTime()) {
    throw new ContractValidationError("end_date must be after start_date");
  }
}

export const contractIdParamSchema = z.object({
  id: objectIdSchema,
});

export const contractOrgQuerySchema = z.object({
  org_id: objectIdSchema,
});

export const contractActorUserIdSchema = objectIdSchema;

export const createContractBodySchema = z
  .object({
    org_id: objectIdSchema,
    contract_number: z.string().min(1).max(64).trim(),
    status: z.enum(["draft", "active", "expired", "terminated"]).optional(),
    type: z.enum(["subscription", "enterprise", "trial"]),
    start_date: dateInputSchema,
    end_date: dateInputSchema,
    auto_renew: z.boolean().optional(),
    billing: billingSchema,
    credits: creditsSchema,
  })
  .superRefine((data, ctx) => {
    try {
      assertContractDateRange(data.start_date, data.end_date);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid date range";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ["end_date"],
      });
    }
  });

export type CreateContractBody = z.infer<typeof createContractBodySchema>;

export const updateContractBodySchema = z
  .object({
    contract_number: z.string().min(1).max(64).trim().optional(),
    status: z.enum(["draft", "active", "expired", "terminated"]).optional(),
    type: z.enum(["subscription", "enterprise", "trial"]).optional(),
    start_date: dateInputSchema.optional(),
    end_date: dateInputSchema.optional(),
    auto_renew: z.boolean().optional(),
    billing: billingSchema.partial().optional(),
    credits: creditsSchema.partial().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.start_date !== undefined && data.end_date !== undefined) {
      try {
        assertContractDateRange(data.start_date, data.end_date);
      } catch (err) {
        const message = err instanceof Error ? err.message : "invalid date range";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
          path: ["end_date"],
        });
      }
    }
  });

export type UpdateContractBody = z.infer<typeof updateContractBodySchema>;

/** Validates merged dates on partial update (call from service with resolved values). */
export function assertMergedContractDates(
  existing: { start_date: Date; end_date: Date },
  patch: { start_date?: Date; end_date?: Date },
): void {
  const start = patch.start_date ?? existing.start_date;
  const end = patch.end_date ?? existing.end_date;
  assertContractDateRange(start, end);
}
