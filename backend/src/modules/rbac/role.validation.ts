import { z } from "zod";

import { isSystemRoleName } from "./system-roles.js";

const objectId24 = z.string().regex(/^[a-fA-F0-9]{24}$/);

const customRoleName = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)
  .refine((n) => !isSystemRoleName(n), "Name conflicts with a system role");

export const createRoleBodySchema = z.object({
  name: customRoleName,
  display_name: z.string().min(1).max(128),
  description: z.string().max(512).optional().default(""),
  permissions: z.array(z.string().min(1)).min(1).max(64),
  hierarchy_level: z.number().int().min(1).max(99),
});

export const updateRoleBodySchema = z
  .object({
    display_name: z.string().min(1).max(128).optional(),
    description: z.string().max(512).optional(),
    permissions: z.array(z.string().min(1)).min(1).max(64).optional(),
    hierarchy_level: z.number().int().min(1).max(99).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "At least one field required");

export const roleIdParamSchema = objectId24;

export const roleIdParamsSchema = z.object({
  id: roleIdParamSchema,
});
