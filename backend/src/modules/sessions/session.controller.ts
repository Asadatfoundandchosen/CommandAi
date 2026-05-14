import type { Request, Response } from "express";

import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import {
  collectSessionKeySuffixes,
  deleteSessionKey,
} from "../../infrastructure/cache/session-key-enumeration.js";

const SESSION_ID_RE = /^[a-zA-Z0-9._-]{8,128}$/;

function badId(res: Response): void {
  res.status(400).json({ error: "Invalid session id" });
}

/**
 * @openapi
 * /api/sessions:
 *   get:
 *     summary: List active server-side session ids (Redis)
 *     description: Requires the same Bearer token as queue admin (QUEUE_ADMIN_TOKEN). Does not include session payload.
 *     security: [ { bearerAuth: [] } ]
 *     tags: [ Sessions ]
 *     responses:
 *       200:
 *         description: Public session ids (cookie / store id), not JWTs
 *       401:
 *         description: Unauthorized
 */
export async function listSessions(_req: Request, res: Response): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    res.status(503).json({ error: "Redis session store unavailable" });
    return;
  }
  const sessionIds = await collectSessionKeySuffixes(
    client,
    config.session.redisKeyPrefix,
  );
  res.status(200).json({ sessionIds });
}

/**
 * @openapi
 * /api/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke a session (delete Redis key)
 *     security: [ { bearerAuth: [] } ]
 *     tags: [ Sessions ]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Revoked or already absent
 *       400:
 *         description: Invalid id
 *       401:
 *         description: Unauthorized
 */
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const id = req.params.sessionId;
  if (!id || !SESSION_ID_RE.test(id)) {
    badId(res);
    return;
  }
  const client = getRedisClient();
  if (!client) {
    res.status(503).json({ error: "Redis session store unavailable" });
    return;
  }
  await deleteSessionKey(client, config.session.redisKeyPrefix, id);
  res.status(204).send();
}
