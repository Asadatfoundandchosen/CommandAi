import { inject, injectable } from "inversify";
import type { Request, Response } from "express";
import { MongoServerError } from "mongodb";
import { z } from "zod";

import { TYPES } from "../../types.js";
import {
  AccountNotInOrganizationError,
  DepartmentService,
} from "./department.service.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import {
  departmentActorUserIdSchema,
  departmentIdParamSchema,
  departmentScopeQuerySchema,
  createDepartmentBodySchema,
  updateDepartmentBodySchema,
} from "./department.validation.js";

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

function resolveAccountId(req: Request): string | null {
  const q = req.query.account_id;
  const h = req.headers["x-account-id"];
  const raw =
    typeof q === "string"
      ? q
      : Array.isArray(q)
        ? q[0]
        : typeof h === "string"
          ? h
          : Array.isArray(h)
            ? h[0]
            : "";
  const trimmed = String(raw ?? "").trim();
  return trimmed || null;
}

function parseScope(req: Request): z.SafeParseReturnType<
  { org_id: string; account_id: string },
  { org_id: string; account_id: string }
> {
  const orgId = req.tenantId ?? "";
  const accountId = resolveAccountId(req);
  return departmentScopeQuerySchema.safeParse({
    org_id: orgId,
    account_id: accountId ?? "",
  });
}

function parseActorUserId(req: Request): z.SafeParseReturnType<string, string> {
  const raw = req.headers["x-user-id"];
  const id =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return departmentActorUserIdSchema.safeParse(String(id ?? "").trim());
}

function resolveTenantScope(
  req: Request,
  res: Response,
): { org_id: string; account_id: string } | null {
  if (!req.tenantId) {
    res.status(401).json({ error: "No tenant context" });
    return null;
  }
  const scope = parseScope(req);
  if (!scope.success) {
    res.status(400).json({
      error: "account_id required (query account_id or header x-account-id)",
    });
    return null;
  }
  return scope.data;
}

@injectable()
export class DepartmentController {
  constructor(
    @inject(TYPES.DepartmentService) private readonly departments: DepartmentService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    const actor = parseActorUserId(req);
    if (!actor.success) {
      res.status(400).json({
        error: "x-user-id header required (24-char hex ObjectId)",
      });
      return;
    }
    const body = createDepartmentBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const auditActor = this.adminAudit.actorFromRequestOrHeader(req) ?? undefined;
      const data = await this.departments.create(
        scope.org_id,
        scope.account_id,
        actor.data,
        body.data,
        auditActor,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (err instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found for this organization" });
        return;
      }
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          error: "department name already exists for this account",
        });
        return;
      }
      throw err;
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    try {
      const data = await this.departments.list(
        scope.org_id,
        scope.account_id,
      );
      res.status(200).json({ data });
    } catch (err) {
      if (err instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found for this organization" });
        return;
      }
      throw err;
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const p = departmentIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    try {
      const row = await this.departments.getById(
        scope.org_id,
        scope.account_id,
        p.data.id,
      );
      if (!row) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ data: row });
    } catch (err) {
      if (err instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found for this organization" });
        return;
      }
      throw err;
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const p = departmentIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    const actor = parseActorUserId(req);
    if (!actor.success) {
      res.status(400).json({
        error: "x-user-id header required (24-char hex ObjectId)",
      });
      return;
    }
    const body = updateDepartmentBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const auditActor = this.adminAudit.actorFromRequestOrHeader(req) ?? undefined;
      const data = await this.departments.update(
        scope.org_id,
        scope.account_id,
        p.data.id,
        actor.data,
        body.data,
        auditActor,
      );
      if (!data) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ data });
    } catch (err) {
      if (err instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found for this organization" });
        return;
      }
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          error: "department name already exists for this account",
        });
        return;
      }
      throw err;
    }
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const p = departmentIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    const actor = parseActorUserId(req);
    if (!actor.success) {
      res.status(400).json({
        error: "x-user-id header required (24-char hex ObjectId)",
      });
      return;
    }
    try {
      const ok = await this.departments.remove(
        scope.org_id,
        scope.account_id,
        p.data.id,
        actor.data,
      );
      if (!ok) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found for this organization" });
        return;
      }
      throw err;
    }
  };
}
