import type { Request, Response } from "express";
import mongoose from "mongoose";

import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

export type HealthCheckResult = {
  name: string;
  status: "ok" | "error";
};

export class HealthController {
  liveness(_req: Request, res: Response): void {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  async readiness(_req: Request, res: Response): Promise<void> {
    const checks = await Promise.all([this.checkMongoDB(), this.checkRedis()]);
    const healthy = checks.every((c) => c.status === "ok");
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    });
  }

  private async checkMongoDB(): Promise<HealthCheckResult> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { name: "mongodb", status: "error" };
      }
      const db = mongoose.connection.db;
      if (!db) {
        return { name: "mongodb", status: "error" };
      }
      await db.admin().ping();
      return { name: "mongodb", status: "ok" };
    } catch {
      return { name: "mongodb", status: "error" };
    }
  }

  /**
   * Targeted database check (pool config + ping). Does not replace `/ready` for k8s.
   */
  async database(_req: Request, res: Response): Promise<void> {
    const pool = {
      min: config.mongodb.minPoolSize,
      max: config.mongodb.maxPoolSize,
    };
    try {
      if (mongoose.connection.readyState !== 1) {
        res.status(503).json({
          status: "degraded",
          mongodb: {
            status: "error",
            readyState: mongoose.connection.readyState,
            pool,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const db = mongoose.connection.db;
      if (!db) {
        res.status(503).json({
          status: "degraded",
          mongodb: { status: "error", message: "no db handle", pool },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const ping = await db.admin().ping();
      const ok = ping["ok"] === 1;
      res.status(ok ? 200 : 503).json({
        status: ok ? "ok" : "degraded",
        mongodb: {
          status: ok ? "ok" : "error",
          readyState: mongoose.connection.readyState,
          pool,
        },
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: "degraded",
        mongodb: { status: "error", readyState: mongoose.connection.readyState, pool },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return { name: "redis", status: "error" };
      }
      const pong = await redis.ping();
      if (pong !== "PONG") {
        return { name: "redis", status: "error" };
      }
      return { name: "redis", status: "ok" };
    } catch {
      return { name: "redis", status: "error" };
    }
  }
}
