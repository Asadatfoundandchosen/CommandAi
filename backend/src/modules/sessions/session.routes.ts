import { requireQueueAdminAuth } from "@common/middleware/index.js";
import type { Router } from "express";
import { Router as createRouter } from "express";

import { listSessions, revokeSession } from "./session.controller.js";

export function createSessionsRouter(): Router {
  const r = createRouter();
  r.get("/", requireQueueAdminAuth(), (req, res, next) => {
    void listSessions(req, res).catch(next);
  });
  r.delete("/:sessionId", requireQueueAdminAuth(), (req, res, next) => {
    void revokeSession(req, res).catch(next);
  });
  return r;
}
