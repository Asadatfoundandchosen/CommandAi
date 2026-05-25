import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { runWithAuditContext } from "@common/audit/audit-context.js";

function parseTraceId(req: Request): string | undefined {
  const traceparent = req.get("traceparent");
  if (traceparent) {
    const parts = traceparent.split("-");
    if (parts.length >= 2 && parts[1]) {
      return parts[1];
    }
  }
  const xTrace = req.get("x-trace-id");
  return xTrace && xTrace.trim().length > 0 ? xTrace.trim() : undefined;
}

/**
 * Assigns `X-Request-Id` and stores request context for Mongoose audit hooks (AsyncLocalStorage).
 */
export function createAuditContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.get("x-request-id");
    const requestId =
      incoming && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
    res.setHeader("X-Request-Id", requestId);
    const traceId = parseTraceId(req);
    runWithAuditContext({ req, requestId, traceId }, () => next());
  };
}
