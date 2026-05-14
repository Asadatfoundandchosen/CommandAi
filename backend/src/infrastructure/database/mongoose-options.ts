import type { ConnectOptions } from "mongoose";

import { getMongooseConnectOptions } from "./mongodb.js";

/**
 * @deprecated Use `getMongooseConnectOptions` from `mongodb.js` (pool + timeouts).
 */
export const defaultMongooseConnectOptions: ConnectOptions =
  getMongooseConnectOptions();

export { getMongooseConnectOptions } from "./mongodb.js";
