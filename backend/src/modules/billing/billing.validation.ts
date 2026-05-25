import { z } from "zod";

export const organizationIdParamSchema = z.object({
  id: z.string().length(24).regex(/^[a-fA-F0-9]{24}$/, "invalid organization id"),
});

export const createStripeCustomerBodySchema = z.object({
  billing_email: z.string().email().optional(),
});

export const createStripeSubscriptionBodySchema = z.object({
  plan_key: z.enum([
    "starter_monthly",
    "starter_annual",
    "pro_monthly",
    "pro_annual",
    "enterprise_annual",
  ]),
});
