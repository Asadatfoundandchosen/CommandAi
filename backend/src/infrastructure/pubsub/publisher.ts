import { z } from "zod";

import { sanitizeKeyPart } from "../../common/middleware/rate-limit-sliding.js";
import type { RedisOrCluster } from "../cache/redis.js";
import { channels } from "./channels.js";
import {
  type RealTimeEventType,
  realTimeEventSchemas,
  redisEnvelopeSchema,
} from "./schemas.js";
import { recordPubsubPublish } from "./pubsub-metrics.js";

/**
 * **PUBLISH** type-checked payloads to per-tenant Redis channels.
 * Uses the shared ioredis / **Cluster** client (PUBLISH is supported in cluster mode).
 */
export class RedisEventPublisher {
  constructor(private readonly client: RedisOrCluster) {}

  /**
   * `publish` to `channels[event](orgId)` with Zod validation of `payload` and a versioned **envelope** on the wire.
   */
  async publish<E extends RealTimeEventType>(
    orgId: string,
    event: E,
    payload: z.infer<(typeof realTimeEventSchemas)[E]>,
  ): Promise<void> {
    const body = realTimeEventSchemas[event].parse(
      payload,
    ) as z.infer<(typeof realTimeEventSchemas)[E]>;
    const org = sanitizeKeyPart(orgId, 64);
    const envelope = redisEnvelopeSchema.parse({
      v: 1,
      type: event,
      orgId: org,
      payload: body,
    });
    const channel = channels[event](orgId);
    await this.client.publish(channel, JSON.stringify(envelope));
    recordPubsubPublish(event);
  }
}

let singleton: RedisEventPublisher | null = null;

export function getRedisEventPublisher(redis: RedisOrCluster | null): RedisEventPublisher | null {
  if (!redis) {
    return null;
  }
  singleton ??= new RedisEventPublisher(redis);
  return singleton;
}
