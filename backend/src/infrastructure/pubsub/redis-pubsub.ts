/**
 * Redis **pub/sub** for **real-time** per-tenant events, bridged to **Socket.io** WebSocket clients.
 *
 * - **Channels:** `{org_id}:{event_type}` (see `channels.ts`).
 * - **Publisher** uses the shared ioredis client; **subscriber** uses a `duplicate()` connection.
 */
export { channels, defaultPubSubPatterns, parseTenantChannel } from "./channels.js";
export { getRedisEventPublisher, RedisEventPublisher } from "./publisher.js";
export { RedisPubSubSubscriber, type PubSubMessageHandler } from "./subscriber.js";
export { createPubSubSocketBridge, type PubSubSocketBridge } from "./socket-bridge.js";
export {
  realTimeEventSchemas,
  redisEnvelopeSchema,
  type RealTimeEventType,
  type RealTimePayloads,
  type RedisPubSubEnvelope,
} from "./schemas.js";
export {
  recordPubsubPublish,
  recordPubsubReceive,
  recordSocketioEmit,
  registerPubSubMetrics,
} from "./pubsub-metrics.js";
