import type { Container } from "inversify";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { hasPermission } from "@modules/rbac/permission.js";
import { PermissionCacheService } from "@modules/rbac/permission-cache.service.js";
import { PermissionResolverService } from "@modules/rbac/permission-resolver.service.js";

/**
 * Loads effective `resource:action:scope` permissions onto `req.userPermissions`
 * from JWT `role` claim (system roles + inheritance).
 */
export function createLoadUserPermissionsMiddleware(
  container: Container,
): RequestHandler {
  const resolver = container.get(PermissionResolverService);
  const permissionCache = container.get(PermissionCacheService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const role = req.user?.role;
    const orgId = req.tenantId ?? req.user?.org_id;

    if (!role || !orgId) {
      next();
      return;
    }

    try {
      const userId = req.user?.sub;
      req.userPermissions = await resolver.resolveForUser(
        orgId,
        role,
        undefined,
        userId,
        permissionCache,
      );
      next();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Permission resolution failed";
      res.status(500).json({ error: message, code: "permission_resolve_failed" });
    }
  };
}

/**
 * Requires a single permission (`resource:action:scope`).
 * Run after JWT auth, tenant middleware, and optionally `createLoadUserPermissionsMiddleware`.
 */
export function createRequirePermission(required: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const grants = req.userPermissions ?? [];
    if (grants.length === 0) {
      res.status(403).json({
        error: "Forbidden",
        code: "permission_denied",
        required,
      });
      return;
    }

    if (!hasPermission(grants, required)) {
      res.status(403).json({
        error: "Forbidden",
        code: "permission_denied",
        required,
      });
      return;
    }

    next();
  };
}

/** Requires any one of the listed permissions. */
export function createRequireAnyPermission(...required: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const grants = req.userPermissions ?? [];
    const allowed = required.some((perm) => hasPermission(grants, perm));
    if (!allowed) {
      res.status(403).json({
        error: "Forbidden",
        code: "permission_denied",
        required,
      });
      return;
    }
    next();
  };
}
