import { z } from "zod";

export const USER_CREATED_VERSION = 1 as const;
export const USER_UPDATED_VERSION = 1 as const;

const userCreatedPayloadSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  createdBy: z.string().min(1),
});

const fieldChangeSchema = z.object({
  from: z.unknown(),
  to: z.unknown(),
});

const userUpdatedPayloadSchema = z.object({
  userId: z.string().min(1),
  orgId: z.string().min(1),
  changes: z.record(z.string(), fieldChangeSchema),
  updatedBy: z.string().min(1),
});

export const userCreatedEventSchema = z.object({
  type: z.literal("user.created"),
  version: z.literal(USER_CREATED_VERSION),
  timestamp: z.coerce.date(),
  payload: userCreatedPayloadSchema,
});

export const userUpdatedEventSchema = z.object({
  type: z.literal("user.updated"),
  version: z.literal(USER_UPDATED_VERSION),
  timestamp: z.coerce.date(),
  payload: userUpdatedPayloadSchema,
});

export type UserCreatedEvent = z.infer<typeof userCreatedEventSchema>;
export type UserUpdatedEvent = z.infer<typeof userUpdatedEventSchema>;
export type UserCreatedPayload = z.infer<typeof userCreatedPayloadSchema>;
export type UserUpdatedPayload = z.infer<typeof userUpdatedPayloadSchema>;

export function createUserCreatedEvent(
  data: UserCreatedPayload,
): UserCreatedEvent {
  return {
    type: "user.created",
    version: USER_CREATED_VERSION,
    timestamp: new Date(),
    payload: data,
  };
}

export function createUserUpdatedEvent(
  data: UserUpdatedPayload,
): UserUpdatedEvent {
  return {
    type: "user.updated",
    version: USER_UPDATED_VERSION,
    timestamp: new Date(),
    payload: data,
  };
}
