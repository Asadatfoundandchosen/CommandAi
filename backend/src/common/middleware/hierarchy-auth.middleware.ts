import type { Request, RequestHandler } from "express";

import { config } from "@config/index.js";

/** Roles accepted via `X-User-Role` (MVP); replace with JWT claims in production. */
export type HierarchyApiRole =
  | "org_admin"
  | "account_admin"
  | "dept_manager"
  | "dept_user";

const ROLE_RANK: Record<HierarchyApiRole, number> = {
  org_admin: 40,
  account_admin: 30,
  dept_manager: 20,
  dept_user: 10,
};

function parseBearer(req: { headers: { authorization?: string } }): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : undefined;
}

/** Requires `Authorization: Bearer <PLATFORM_ADMIN_TOKEN>` (organizations API). */
export function requirePlatformAdmin(): RequestHandler {
  return (req, res, next) => {
    const expected = config.hierarchy.platformAdminToken;
    if (!expected) {
      res.status(503).json({
        error: "Organization admin API is not configured (set PLATFORM_ADMIN_TOKEN)",
      });
      return;
    }
    const bearer = parseBearer(req);
    if (bearer !== expected) {
      res.status(401).json({ error: "Unauthorized (platform admin)" });
      return;
    }
    next();
  };
}

/** Minimum **X-User-Role** rank required for a route group (higher roles pass). */
export type HierarchyRouteMinimum = "org_admin" | "account_admin" | "dept_manager";

/**
 * Minimum role for hierarchy CRUD:
 * - Accounts: **org_admin**
 * - Departments: **account_admin** (org_admin also allowed)
 * - Users: **dept_manager** (higher roles also allowed)
 */
function resolveCallerRole(req: Request): HierarchyApiRole | "" {
  const jwtRole =
    typeof req.user?.role === "string" ? (req.user.role.trim() as HierarchyApiRole) : "";
  if (jwtRole && jwtRole in ROLE_RANK) {
    return jwtRole;
  }
  const raw = req.headers["x-user-role"];
  const headerRole =
    typeof raw === "string"
      ? (raw.trim() as HierarchyApiRole)
      : Array.isArray(raw)
        ? (raw[0]?.trim() as HierarchyApiRole)
        : "";
  return headerRole && headerRole in ROLE_RANK ? headerRole : "";
}

export function requireMinimumHierarchyRole(
  minimum: HierarchyRouteMinimum,
): RequestHandler {
  const minRank = ROLE_RANK[minimum];
  return (req, res, next) => {
    const role = resolveCallerRole(req);
    if (!role) {
      res.status(401).json({
        error:
          "JWT role claim or X-User-Role header required: org_admin | account_admin | dept_manager | dept_user",
      });
      return;
    }
    if (ROLE_RANK[role] < minRank) {
      res.status(403).json({
        error: `Insufficient role (requires at least ${minimum})`,
      });
      return;
    }
    next();
  };
}
