import { config } from "../../config/index.js";
import { getOrCreateRedis } from "../cache/redis.js";

/**
 * Single **ioredis** / **Cluster** instance for BullMQ (shared with `connectRedis` / health).
 * **Hash tags** in queue names are recommended for Redis Cluster scale-out (BullMQ pattern).
 */
export const queueConnection = getOrCreateRedis(config.redis);
