import { z } from "zod";

const urlSchema = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
    message: "url must be http or https",
  });

export const createWebhookBodySchema = z.object({
  name: z.string().min(1).max(200),
  url: urlSchema,
  /** If omitted, a random secret is generated. */
  secret: z.string().min(16).max(256).optional(),
  isActive: z.boolean().optional(),
});

export const broadcastEventBodySchema = z.object({
  event: z.unknown(),
});

export const listDeliveriesQuerySchema = z.object({
  org_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  webhook_id: z.string().uuid().optional(),
});

export const orgIdParamSchema = z.object({
  org_id: z.string().min(1),
});

export const webhookIdParamSchema = z.object({
  id: z.string().uuid(),
});
