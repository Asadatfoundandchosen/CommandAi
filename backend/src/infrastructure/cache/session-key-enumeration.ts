import { Cluster, Redis } from "ioredis";

import type { RedisOrCluster } from "./redis.js";

function isClusterClient(c: RedisOrCluster): c is Cluster {
  return "nodes" in c && typeof (c as Cluster).nodes === "function";
}

/**
 * Count and list session store keys. On **Cluster**, scans all **primary** nodes
 * so counts match a distributed `sess:*` (connect-redis / express-session).
 */
export async function countSessionKeys(
  client: RedisOrCluster,
  prefix: string,
): Promise<number> {
  const keys = await collectSessionKeySuffixes(client, prefix);
  return keys.length;
}

export async function collectSessionKeySuffixes(
  client: RedisOrCluster,
  prefix: string,
): Promise<string[]> {
  const match = `${prefix}*`;
  const seen = new Set<string>();
  const plen = prefix.length;

  if (isClusterClient(client)) {
    for (const node of client.nodes("master")) {
      let cursor = "0";
      do {
        const [next, klist] = await node.scan(
          cursor,
          "MATCH",
          match,
          "COUNT",
          500,
        );
        cursor = next;
        for (const k of klist) {
          seen.add(k.length >= plen ? k.slice(plen) : k);
        }
      } while (cursor !== "0");
    }
    return [...seen];
  }

  let c = "0";
  do {
    const [next, klist] = await (client as Redis).scan(
      c,
      "MATCH",
      match,
      "COUNT",
      500,
    );
    c = next;
    for (const k of klist) {
      seen.add(k.length >= plen ? k.slice(plen) : k);
    }
  } while (c !== "0");
  return [...seen];
}

/** Delete a session value by public session id (cookie id), same prefix as RedisStore. */
export async function deleteSessionKey(
  client: RedisOrCluster,
  prefix: string,
  sessionId: string,
): Promise<number> {
  return client.del(`${prefix}${sessionId}`);
}
