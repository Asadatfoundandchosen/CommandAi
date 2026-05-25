import { z } from "zod";

export const changePlanBodySchema = z.object({
  tier: z.enum(["starter", "pro", "enterprise"]),
  billing_cycle: z.enum(["monthly", "annual"]),
});

export type ChangePlanBody = z.infer<typeof changePlanBodySchema>;
