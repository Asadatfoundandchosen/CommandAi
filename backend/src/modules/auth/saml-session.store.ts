import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

export const SAML_SESSION_KEY_PREFIX = "saml:session:" as const;
export const SAML_SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export type StoredSamlSession = {
  name_id: string;
  session_index?: string;
  org_id: string;
};

export function samlSessionKey(userId: string): string {
  return `${SAML_SESSION_KEY_PREFIX}${userId}`;
}

export async function saveSamlSession(
  userId: string,
  session: StoredSamlSession,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  await redis.set(
    samlSessionKey(userId),
    JSON.stringify(session),
    "EX",
    SAML_SESSION_TTL_SEC,
  );
}

export async function loadSamlSession(
  userId: string,
): Promise<StoredSamlSession | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }
  const raw = await redis.get(samlSessionKey(userId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSamlSession;
  } catch {
    return null;
  }
}

export async function clearSamlSession(userId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  await redis.del(samlSessionKey(userId));
}
