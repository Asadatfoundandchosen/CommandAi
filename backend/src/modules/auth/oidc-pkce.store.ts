import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

import { OIDC_PKCE_KEY_PREFIX, OIDC_PKCE_TTL_SEC } from "./oidc.constants.js";

export type StoredOidcPkce = {
  org_id: string;
  code_verifier: string;
};

export function oidcPkceKey(state: string): string {
  return `${OIDC_PKCE_KEY_PREFIX}${state}`;
}

export async function saveOidcPkce(
  state: string,
  payload: StoredOidcPkce,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error("Redis unavailable");
  }
  await redis.set(
    oidcPkceKey(state),
    JSON.stringify(payload),
    "EX",
    OIDC_PKCE_TTL_SEC,
  );
}

export async function consumeOidcPkce(
  state: string,
): Promise<StoredOidcPkce | null> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error("Redis unavailable");
  }
  const key = oidcPkceKey(state);
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  try {
    return JSON.parse(raw) as StoredOidcPkce;
  } catch {
    return null;
  }
}
