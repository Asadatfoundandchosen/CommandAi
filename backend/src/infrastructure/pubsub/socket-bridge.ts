import type { Server as HttpServer } from "node:http";

import { Server as IoServer } from "socket.io";

import { sanitizeKeyPart } from "../../common/middleware/rate-limit-sliding.js";
import { defaultPubSubPatterns } from "./channels.js";
import { recordSocketioEmit } from "./pubsub-metrics.js";
import { RedisPubSubSubscriber } from "./subscriber.js";
import type { RedisOrCluster } from "../cache/redis.js";

export type PubSubSocketBridge = {
  io: IoServer;
  subscriber: RedisPubSubSubscriber;
  close: () => Promise<void>;
};

/**
 * **Socket.io** on the same HTTP **Server** as Express, with rooms `org:{orgId}`.
 * **Subscribe**s to Redis `PSUBSCRIBE` patterns and **emit**s `socket.emit(type, payload)` to that org.
 *
 * **Auth (MVP):** `io({ auth: { orgId: "<tenant>" } })` — in production, validate a **JWT** in
 * `io.use` and set `org_id` from claims (never trust client-only orgId without auth).
 */
export async function createPubSubSocketBridge(
  httpServer: HttpServer,
  redis: RedisOrCluster,
  options: { path?: string } = {},
): Promise<PubSubSocketBridge> {
  const io = new IoServer(httpServer, {
    path: options.path ?? "/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { orgId?: string } | undefined;
    const org = auth?.orgId;
    if (typeof org !== "string" || org.length === 0) {
      next(new Error("orgId is required in handshake.auth"));
      return;
    }
    const room = `org:${sanitizeKeyPart(org, 64)}`;
    void socket.join(room);
    next();
  });

  const subscriber = new RedisPubSubSubscriber(redis);
  await subscriber.start([...defaultPubSubPatterns], (envelope) => {
    const room = `org:${envelope.orgId}`;
    recordSocketioEmit(envelope.type);
    io.to(room).emit(envelope.type, envelope.payload);
  });

  return {
    io,
    subscriber,
    close: async () => {
      await subscriber.stop();
      await io.close();
    },
  };
}
