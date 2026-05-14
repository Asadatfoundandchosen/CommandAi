import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Requires `req.user.org_id` from JWT (run after `authenticateJwt`).
 * Sets `req.tenantId` as 24-char hex — use for all DB scope instead of query `org_id`.
 */
export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.user;
  if (!token?.org_id) {
    res.status(401).json({ error: "No tenant context" });
    return;
  }
  const oid =
    typeof token.org_id === "string"
      ? token.org_id
      : String((token as { org_id: unknown }).org_id);
  if (!/^[a-fA-F0-9]{24}$/.test(oid)) {
    res.status(401).json({ error: "Invalid tenant id in token" });
    return;
  }
  req.tenantId = oid.toLowerCase();
  next();
}

/** Rejects requests where query/header `org_id` / `x-org-id` disagrees with JWT tenant. */
export function rejectCrossTenantOrgHint(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      next();
      return;
    }
    const hints: string[] = [];
    const q = req.query.org_id;
    if (typeof q === "string") {
      hints.push(q.trim());
    } else if (Array.isArray(q)) {
      for (const x of q) {
        if (typeof x === "string") {
          hints.push(x.trim());
        }
      }
    }
    const hx = req.headers["x-org-id"];
    if (typeof hx === "string") {
      hints.push(hx.trim());
    } else if (Array.isArray(hx)) {
      for (const x of hx) {
        hints.push(String(x).trim());
      }
    }
    for (const h of hints) {
      if (h.length > 0 && h.toLowerCase() !== tenantId) {
        res.status(403).json({ error: "Cross-tenant access denied" });
        return;
      }
    }
    next();
  };
}
