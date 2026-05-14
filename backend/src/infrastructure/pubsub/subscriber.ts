import type { Redis } from "ioredis";

import { parseTenantChannel } from "./channels.js";
import type { RedisPubSubEnvelope } from "./schemas.js";
import { redisEnvelopeSchema } from "./schemas.js";
import { recordPubsubReceive } from "./pubsub-metrics.js";
import type { RedisOrCluster } from "../cache/redis.js";

export type PubSubMessageHandler = (
  envelope: RedisPubSubEnvelope,
  channel: string,
) => void;

/**
 * Dedicated **duplicate** connection for `PSUBSCRIBE` (required; PUBLISH cannot share the “subscribe mode” connection).
 */
export class RedisPubSubSubscriber {
  private sub: Redis | null = null;
  private started = false;

  constructor(private readonly client: RedisOrCluster) {}

  /**
   * Subscribe to Redis **pattern** channels and invoke `onMessage` for each parsed envelope.
   */
  async start(
    patterns: readonly string[] | string[],
    onMessage: PubSubMessageHandler,
  ): Promise<void> {
    if (this.started) {
      return;
    }
    this.sub = this.client.duplicate() as unknown as Redis;
    const sub = this.sub;
    sub.on("pmessage", (_pattern, channel, message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message) as unknown;
      } catch {
        return;
      }
      const env = redisEnvelopeSchema.safeParse(parsed);
      if (!env.success) {
        return;
      }
      const tc = parseTenantChannel(channel);
      if (!tc) {
        return;
      }
      recordPubsubReceive(tc.type);
      onMessage(env.data, channel);
    });
    if (patterns.length === 0) {
      return;
    }
    await sub.psubscribe(...patterns);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.sub) {
      return;
    }
    try {
      await this.sub.punsubscribe();
    } catch {
      /* best-effort */
    }
    this.sub.disconnect();
    this.sub = null;
    this.started = false;
  }
}
