import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import {
  ACTIONS,
  RESOURCES,
  SCOPES,
  buildPermissionMatrixCells,
} from "./permission.js";
import { PERMISSION_CATALOG } from "./permissions.js";
import { SYSTEM_ROLE_DEFINITIONS, getSystemRoleDefinition } from "./system-roles.js";
import { PERMISSION_CACHE_TTL_SEC } from "./permission-cache.service.js";
import { PermissionResolverService } from "./permission-resolver.service.js";
import { getEffectiveRoleNames } from "./role-hierarchy.js";
import {
  InvalidPermissionsError,
  RoleNotFoundError,
  RoleService,
  SystemRoleProtectedError,
} from "./role.service.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import {
  createRoleBodySchema,
  roleIdParamSchema,
  updateRoleBodySchema,
} from "./role.validation.js";

@injectable()
export class RoleController {
  constructor(
    @inject(RoleService) private readonly roles: RoleService,
    @inject(PermissionResolverService) private readonly permissions: PermissionResolverService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  /** `GET /api/v1/roles/permissions` — schema + assignable permission catalog. */
  listPermissions = (_req: Request, res: Response): void => {
    res.status(200).json({
      data: {
        format: "resource:action:scope",
        resources: [...RESOURCES],
        actions: [...ACTIONS],
        scopes: [...SCOPES],
        permissions: [...PERMISSION_CATALOG],
      },
    });
  };

  /** `GET /api/v1/roles/hierarchy` — role chain + inheritance for admin UI. */
  hierarchy = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const view = this.permissions.getHierarchyView();
    const examples = await Promise.all(
      view.chain.map(async (role) => {
        const inherited = getEffectiveRoleNames(role);
        const direct = getSystemRoleDefinition(role)?.permissions ?? [];
        const effective = await this.permissions.resolvePermissionsForRoleNames(role);
        return {
          role,
          inherits_from: inherited.slice(1),
          direct_permissions: [...direct],
          inherited_permissions: effective,
          direct_permission_count: direct.length,
          effective_permission_count: effective.length,
        };
      }),
    );

    res.status(200).json({
      data: {
        ...view,
        examples,
        cache_ttl_seconds: PERMISSION_CACHE_TTL_SEC,
        cache_key_format: "permissions:{userId}",
      },
    });
  };

  /** `GET /api/v1/roles/permission-matrix` — matrix for UI + role rows. */
  permissionMatrix = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const roles = await this.roles.listRoles(orgId);
    res.status(200).json({
      data: {
        format: "resource:action:scope",
        resources: [...RESOURCES],
        actions: [...ACTIONS],
        scopes: [...SCOPES],
        cells: buildPermissionMatrixCells(),
        system_roles: SYSTEM_ROLE_DEFINITIONS.map((r) => ({
          name: r.name,
          display_name: r.display_name,
          hierarchy_level: r.hierarchy_level,
          permissions: [...r.permissions],
        })),
        roles,
      },
    });
  };

  /** `GET /api/v1/roles` */
  list = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const data = await this.roles.listRoles(orgId);
    res.status(200).json({ data });
  };

  /** `GET /api/v1/roles/:id` */
  getById = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const idParsed = roleIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid role id" });
      return;
    }
    try {
      const data = await this.roles.getRole(orgId, idParsed.data);
      res.status(200).json({ data });
    } catch (e) {
      this.handleError(res, e);
    }
  };

  /** `POST /api/v1/roles` */
  create = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = createRoleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const actor = this.adminAudit.actorFromRequest(req);
      const data = await this.roles.createRole(orgId, parsed.data, actor ?? undefined);
      res.status(201).json({ data });
    } catch (e) {
      this.handleError(res, e);
    }
  };

  /** `PATCH /api/v1/roles/:id` */
  update = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const idParsed = roleIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid role id" });
      return;
    }
    const bodyParsed = updateRoleBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error.flatten() });
      return;
    }
    try {
      const actor = this.adminAudit.actorFromRequest(req);
      const data = await this.roles.updateRole(
        orgId,
        idParsed.data,
        bodyParsed.data,
        actor ?? undefined,
      );
      res.status(200).json({ data });
    } catch (e) {
      this.handleError(res, e);
    }
  };

  /** `DELETE /api/v1/roles/:id` */
  remove = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const idParsed = roleIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid role id" });
      return;
    }
    try {
      const actor = this.adminAudit.actorFromRequest(req);
      await this.roles.deleteRole(orgId, idParsed.data, actor ?? undefined);
      res.status(204).send();
    } catch (e) {
      this.handleError(res, e);
    }
  };

  private handleError(res: Response, e: unknown): void {
    if (e instanceof RoleNotFoundError) {
      res.status(404).json({ error: e.message });
      return;
    }
    if (e instanceof SystemRoleProtectedError) {
      res.status(403).json({ error: e.message, code: "system_role_protected" });
      return;
    }
    if (e instanceof InvalidPermissionsError) {
      res.status(400).json({ error: e.message, code: "invalid_permissions" });
      return;
    }
    const message = e instanceof Error ? e.message : "Role operation failed";
    res.status(500).json({ error: message });
  }
}
