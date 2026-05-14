import type { Request } from "express";

import { sanitizeKeyPart } from "./rate-limit-sliding.js";

/**
 * Resolves **org (tenant) id** for multi-tenant cache keys. Prefer `org_id` from **JWT** when
 * an auth layer sets it; else headers and query. Align with rate limiter and security rules
 * (never trust body alone for `org_id`).
 */
export function getOrgIdForRequest(req: Request): string {
  const h = req.headers["x-org-id"] ?? req.headers["X-Org-Id"];
  if (typeof h === "string" && h.length > 0) {
    return sanitizeKeyPart(h, 64);
  }
  const q = req.query.org_id;
  if (typeof q === "string" && q.length > 0) {
    return sanitizeKeyPart(q, 64);
  }
  if (typeof req.tenantId === "string" && req.tenantId.length > 0) {
    return sanitizeKeyPart(req.tenantId, 64);
  }
  return "public";
}
