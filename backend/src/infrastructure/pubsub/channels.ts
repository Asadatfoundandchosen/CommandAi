import { sanitizeKeyPart } from "../../common/middleware/rate-limit-sliding.js";

/**
 * **Per-tenant** channels: `{org_id}:{event_type}`.
 * `org_id` is **sanitized** (no `:`) so a channel splits cleanly as `org` + `event`.
 */
export const channels = {
  signals: (orgId: string) => `${sanitizeKeyPart(orgId, 64)}:signals`,
  approvals: (orgId: string) => `${sanitizeKeyPart(orgId, 64)}:approvals`,
  notifications: (orgId: string) => `${sanitizeKeyPart(orgId, 64)}:notifications`,
} as const;

export type RealtimeChannelType = keyof typeof channels;

/** `PSUBSCRIBE` glob patterns (org segment has no `:` in our naming). */
export const defaultPubSubPatterns = [
  "*:signals",
  "*:approvals",
  "*:notifications",
] as const;

/**
 * @returns `{ orgId, type }` or `null` if the channel is not `org:signals|approvals|notifications`.
 */
export function parseTenantChannel(redisChannel: string): {
  orgId: string;
  type: RealtimeChannelType;
} | null {
  const parts = redisChannel.split(":");
  if (parts.length < 2) {
    return null;
  }
  const type = parts[parts.length - 1] as string;
  if (type !== "signals" && type !== "approvals" && type !== "notifications") {
    return null;
  }
  const orgId = parts.slice(0, -1).join(":");
  if (orgId.length === 0) {
    return null;
  }
  return { orgId, type: type as RealtimeChannelType };
}
