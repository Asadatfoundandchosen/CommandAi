import { z } from "zod";

export const APPROVAL_NEEDED_VERSION = 1 as const;

const approvalNeededPayloadSchema = z.object({
  approvalId: z.string().min(1),
  orgId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  requestedBy: z.string().min(1),
  reason: z.string().optional(),
});

export const approvalNeededEventSchema = z.object({
  type: z.literal("approval.needed"),
  version: z.literal(APPROVAL_NEEDED_VERSION),
  timestamp: z.coerce.date(),
  payload: approvalNeededPayloadSchema,
});

export type ApprovalNeededEvent = z.infer<typeof approvalNeededEventSchema>;
export type ApprovalNeededPayload = z.infer<typeof approvalNeededPayloadSchema>;

export function createApprovalNeededEvent(
  data: ApprovalNeededPayload,
): ApprovalNeededEvent {
  return {
    type: "approval.needed",
    version: APPROVAL_NEEDED_VERSION,
    timestamp: new Date(),
    payload: data,
  };
}
