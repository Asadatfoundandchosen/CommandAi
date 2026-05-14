import { trace } from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";

/**
 * Enriches the active HTTP server span with tenant/user from headers (W3C trace context is handled by the SDK).
 */
export function traceContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const span = trace.getActiveSpan();
  if (span) {
    const orgId = req.headers["x-org-id"];
    const userId = req.headers["x-user-id"];
    if (typeof orgId === "string" && orgId.length > 0) {
      span.setAttribute("org.id", orgId);
    }
    if (typeof userId === "string" && userId.length > 0) {
      span.setAttribute("user.id", userId);
    }
  }
  next();
}
