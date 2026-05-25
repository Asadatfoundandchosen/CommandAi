import "reflect-metadata";

import { createServer, type Server } from "node:http";

import mongoose from "mongoose";

import type { Express } from "express";

import { config } from "./config/index.js";
import { createSessionMiddleware } from "./common/middleware/session.middleware.js";
import {
  getMongooseConnectOptions,
  wireMongooseConnectionEvents,
} from "./infrastructure/database/mongodb.js";
import { gracefulShutdown } from "./common/utils/shutdown.js";
import { createApp } from "./app.js";
import { container } from "./container.js";
import { RoleService } from "./modules/rbac/role.service.js";
import { connectRedis, getRedisClient, quitRedis } from "./infrastructure/cache/index.js";
import { initCacheInvalidationEventListeners } from "./infrastructure/cache/invalidation.js";
import {
  connectMongodbAnalytics,
  connectTimescale,
  disconnectMongo,
  registerMongoDisconnect,
  stopAnalyticsReadMonitoring,
} from "./infrastructure/database/index.js";
import {
  closeBullMqQueuesAndWorkers,
  initAllDlqHandlers,
  initScheduler,
  startBullMqWorkers,
} from "./infrastructure/queue/index.js";
import { stopMongoPoolMetrics } from "./infrastructure/database/mongo-pool-metrics.js";
import {
  setupQueueMonitoring,
  startQueueMetricsCollector,
  stopQueueMetricsCollector,
  stopSessionMetrics,
} from "./infrastructure/queue/monitoring/setup-queue-monitoring.js";
import { getWorkers } from "./infrastructure/queue/queue.workers.js";
import { createPubSubSocketBridge } from "./infrastructure/pubsub/socket-bridge.js";
import type { PubSubSocketBridge } from "./infrastructure/pubsub/socket-bridge.js";
import { getRedisEventPublisher } from "./infrastructure/pubsub/publisher.js";
import {
  closeOpenSearch,
  connectOpenSearch,
} from "./infrastructure/search/index.js";

let app!: Express;

let server: Server | undefined;
let pubSubBridge: PubSubSocketBridge | undefined;

void bootstrap();

async function bootstrap(): Promise<void> {
  try {
    wireMongooseConnectionEvents(mongoose);
    await mongoose.connect(config.mongodb.uri, getMongooseConnectOptions());
    registerMongoDisconnect(() => mongoose.disconnect());
    try {
      await container.get(RoleService).ensureSystemRolesSeeded();
    } catch (e) {
      process.stderr.write(`System roles seed failed: ${String(e)}\n`);
    }
    if (config.mongodb.analytics) {
      try {
        await connectMongodbAnalytics();
      } catch (e) {
        process.stderr.write(`MongoDB analytics connect failed: ${String(e)}\n`);
      }
    }
    if (config.timescale) {
      try {
        await connectTimescale(config.timescale);
      } catch (e) {
        process.stderr.write(`TimescaleDB connect failed: ${String(e)}\n`);
      }
    }
    if (config.opensearch) {
      try {
        await connectOpenSearch(config.opensearch);
      } catch (e) {
        process.stderr.write(`OpenSearch connect failed: ${String(e)}\n`);
      }
    }
  } catch (e) {
    process.stderr.write(`MongoDB connect failed: ${String(e)}\n`);
  }
  try {
    await connectRedis(config.redis);
  } catch (e) {
    process.stderr.write(`Redis connect failed: ${String(e)}\n`);
  }

  const sessionMw =
    getRedisClient() !== null
      ? (() => {
          try {
            return createSessionMiddleware();
          } catch (e) {
            process.stderr.write(`Session middleware failed: ${String(e)}\n`);
            return undefined;
          }
        })()
      : undefined;
  if (!getRedisClient()) {
    process.stderr.write(
      "Redis unavailable: session store and BullMQ will be limited or disabled.\n",
    );
  }

  app = createApp(container, sessionMw ? { sessionMiddleware: sessionMw } : {});

  try {
    if (getRedisClient()) {
      startBullMqWorkers();
      initAllDlqHandlers(getWorkers());
      setupQueueMonitoring(app);
      startQueueMetricsCollector();
      initCacheInvalidationEventListeners();
    }
  } catch (e) {
    process.stderr.write(`Queue / monitoring init failed: ${String(e)}\n`);
  }
  try {
    await initScheduler();
  } catch (e) {
    process.stderr.write(`Job scheduler init failed: ${String(e)}\n`);
  }

  const httpServer = createServer(app);
  server = httpServer;

  const r = getRedisClient();
  if (r && config.pubsub.enabled) {
    getRedisEventPublisher(r);
  }
  if (r && config.pubsub.enabled && config.pubsub.websocketEnabled) {
    try {
      pubSubBridge = await createPubSubSocketBridge(httpServer, r);
    } catch (e) {
      process.stderr.write(`Pub/sub WebSocket bridge failed: ${String(e)}\n`);
    }
  }

  httpServer.listen(config.port, "0.0.0.0", () => {
    process.stdout.write(`Backend listening on ${config.port}\n`);
  });
}

/** 0) Stop Redis pub/sub subscriber + **Socket.io** (before **HTTP** drain). */
gracefulShutdown.register(async () => {
  if (pubSubBridge) {
    try {
      await pubSubBridge.close();
    } catch (e) {
      process.stderr.write(`PubSub bridge close: ${String(e)}\n`);
    }
  }
});

/** 1) Stop accepting new HTTP connections and drain existing (server.close). */
gracefulShutdown.register(
  () =>
    new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }),
);

/** 2) Close OpenSearch client (audit search) after HTTP drain. */
gracefulShutdown.register(() => closeOpenSearch());

/** 3) Close MongoDB pools when `registerMongoDisconnect` is wired. */
gracefulShutdown.register(() => disconnectMongo());

/** 4) Stop queue / Mongo pool metrics polling before closing workers. */
gracefulShutdown.register(async () => {
  stopQueueMetricsCollector();
  stopSessionMetrics();
  stopMongoPoolMetrics();
  stopAnalyticsReadMonitoring();
});

/** 5) Stop BullMQ workers and queue handles before closing the shared Redis client. */
gracefulShutdown.register(() => closeBullMqQueuesAndWorkers());

/** 6) Quit Redis when `registerRedisQuit` is wired. */
gracefulShutdown.register(() => quitRedis());
