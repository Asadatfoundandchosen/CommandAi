import { z } from "zod";

export const AGENT_REGISTERED_VERSION = 1 as const;

const agentRegisteredPayloadSchema = z.object({
  agentId: z.string().min(1),
  orgId: z.string().min(1),
  name: z.string().min(1),
  registeredBy: z.string().min(1),
});

export const agentRegisteredEventSchema = z.object({
  type: z.literal("agent.registered"),
  version: z.literal(AGENT_REGISTERED_VERSION),
  timestamp: z.coerce.date(),
  payload: agentRegisteredPayloadSchema,
});

export type AgentRegisteredEvent = z.infer<typeof agentRegisteredEventSchema>;
export type AgentRegisteredPayload = z.infer<typeof agentRegisteredPayloadSchema>;

export function createAgentRegisteredEvent(
  data: AgentRegisteredPayload,
): AgentRegisteredEvent {
  return {
    type: "agent.registered",
    version: AGENT_REGISTERED_VERSION,
    timestamp: new Date(),
    payload: data,
  };
}
