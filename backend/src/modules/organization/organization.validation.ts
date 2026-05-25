import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase alphanumeric with hyphens");

const settingsSchema = z.object({
  timezone: z.string().min(1),
  locale: z.string().min(1),
  features: z.array(z.string()),
});

/** Body for creating an organization (platform / tenant root). */
export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).max(256),
  slug: slugSchema,
  status: z.enum(["active", "suspended", "trial"]).optional(),
  settings: settingsSchema.optional(),
});

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

/** Partial update body. */
export const updateOrganizationBodySchema = createOrganizationBodySchema.partial();

export type UpdateOrganizationBody = z.infer<typeof updateOrganizationBodySchema>;

export const organizationIdParamSchema = z.object({
  id: z.string().length(24).regex(/^[a-fA-F0-9]{24}$/, "invalid organization id"),
});

export { setOrgCreditRatesBodySchema } from "../credits/credits.validation.js";
