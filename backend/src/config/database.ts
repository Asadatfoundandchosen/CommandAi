import { config } from "./index.js";

/** MongoDB connection settings derived from validated env (see `config/index.ts`). */
export const databaseConfig = {
  uri: config.mongodb.uri,
} as const;
