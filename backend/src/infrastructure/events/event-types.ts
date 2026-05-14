/**
 * String literal event names for the in-process bus. Payload types should be
 * colocated in domain modules and subscribed with matching generics.
 */
export const Events = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  AGENT_REGISTERED: "agent.registered",
  SIGNAL_RECEIVED: "signal.received",
  APPROVAL_NEEDED: "approval.needed",
  /** Emitted after writes to clear tagged GET response cache (see `requestCacheInvalidation`). */
  CACHE_INVALIDATION_REQUESTED: "cache.invalidation.requested",
} as const;

export type EventName = (typeof Events)[keyof typeof Events];
