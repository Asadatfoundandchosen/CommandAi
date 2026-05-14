import { z } from "zod";

import {
  type ApprovalNeededEvent,
  approvalNeededEventSchema,
} from "./approval.events.js";
import {
  type AgentRegisteredEvent,
  agentRegisteredEventSchema,
} from "./agent.events.js";
import {
  type SignalReceivedEvent,
  signalReceivedEventSchema,
} from "./signal.events.js";
import { type UserCreatedEvent, type UserUpdatedEvent, userCreatedEventSchema, userUpdatedEventSchema } from "./user.events.js";

export * from "./approval.events.js";
export * from "./agent.events.js";
export * from "./signal.events.js";
export * from "./user.events.js";

/** All known in-process domain event envelopes (v1). */
export type AllDomainEvents =
  | UserCreatedEvent
  | UserUpdatedEvent
  | AgentRegisteredEvent
  | SignalReceivedEvent
  | ApprovalNeededEvent;

export const allDomainEventSchema: z.ZodType<AllDomainEvents> = z.discriminatedUnion(
  "type",
  [
    userCreatedEventSchema,
    userUpdatedEventSchema,
    agentRegisteredEventSchema,
    signalReceivedEventSchema,
    approvalNeededEventSchema,
  ],
);
