import { config } from "./index.js";

/** Redis connection settings derived from validated env (see `config/index.ts`). */
export const redisConfig = {
  url: config.redis.url,
} as const;
