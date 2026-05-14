import { z } from "zod";

export const SIGNAL_RECEIVED_VERSION = 1 as const;

const signalReceivedPayloadSchema = z.object({
  signalId: z.string().min(1),
  orgId: z.string().min(1),
  agentId: z.string().min(1),
  source: z.string().min(1),
  payload: z.record(z.unknown()),
});

export const signalReceivedEventSchema = z.object({
  type: z.literal("signal.received"),
  version: z.literal(SIGNAL_RECEIVED_VERSION),
  timestamp: z.coerce.date(),
  payload: signalReceivedPayloadSchema,
});

export type SignalReceivedEvent = z.infer<typeof signalReceivedEventSchema>;
export type SignalReceivedPayload = z.infer<typeof signalReceivedPayloadSchema>;

export function createSignalReceivedEvent(
  data: SignalReceivedPayload,
): SignalReceivedEvent {
  return {
    type: "signal.received",
    version: SIGNAL_RECEIVED_VERSION,
    timestamp: new Date(),
    payload: data,
  };
}
