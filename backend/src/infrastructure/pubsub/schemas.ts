import { z } from "zod";

/** In-app **signal** fan-out (typed). */
export const signalEventPayloadSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

export const approvalEventPayloadSchema = z.object({
  id: z.string().min(1),
  resource: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  requestedBy: z.string().optional(),
});

export const notificationEventPayloadSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  meta: z.record(z.unknown()).optional(),
});

/**
 * Zod **discriminated** map: channel event type → payload schema. Used in `Publisher`.
 */
export const realTimeEventSchemas = {
  signals: signalEventPayloadSchema,
  approvals: approvalEventPayloadSchema,
  notifications: notificationEventPayloadSchema,
} as const;

export type RealTimeEventType = keyof typeof realTimeEventSchemas;

export type RealTimePayloads = {
  [K in RealTimeEventType]: z.infer<(typeof realTimeEventSchemas)[K]>;
};

/** Wire envelope on the Redis line (so subscribers can route before parsing payload). */
export const redisEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.enum(["signals", "approvals", "notifications"]),
  orgId: z.string().min(1),
  payload: z.unknown(),
});

export type RedisPubSubEnvelope = z.infer<typeof redisEnvelopeSchema>;
