import { inject, injectable } from "inversify";
import type { Request, Response } from "express";
import { MongoServerError } from "mongodb";
import { z } from "zod";

import { TYPES } from "../../types.js";
import {
  AccountNotInOrganizationError,
  DepartmentNotInAccountError,
  UserService,
} from "./user.service.js";
import {
  createUserBodySchema,
  updateUserBodySchema,
  userActorUserIdSchema,
  userIdParamSchema,
  userScopeQuerySchema,
} from "./user.validation.js";

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

function isHierarchyValidationFailure(err: unknown): boolean {
  return (
    err instanceof AccountNotInOrganizationError ||
    err instanceof DepartmentNotInAccountError
  );
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
  return String(raw ?? "").trim() || null;
}

function resolveDepartmentId(req: Request): string | null {
  const q = req.query.department_id;
  const h = req.headers["x-department-id"];
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
  return String(raw ?? "").trim() || null;
}

function parseScope(req: Request): z.SafeParseReturnType<
  { org_id: string; account_id: string; department_id: string },
  { org_id: string; account_id: string; department_id: string }
> {
  return userScopeQuerySchema.safeParse({
    org_id: req.tenantId ?? "",
    account_id: resolveAccountId(req) ?? "",
    department_id: resolveDepartmentId(req) ?? "",
  });
}

function parseActorUserId(req: Request): z.SafeParseReturnType<string, string> {
  const raw = req.headers["x-user-id"];
  const id =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return userActorUserIdSchema.safeParse(String(id ?? "").trim());
}

function resolveTenantScope(
  req: Request,
  res: Response,
): {
  org_id: string;
  account_id: string;
  department_id: string;
} | null {
  if (!req.tenantId) {
    res.status(401).json({ error: "No tenant context" });
    return null;
  }
  const scope = parseScope(req);
  if (!scope.success) {
    res.status(400).json({
      error:
        "account_id and department_id required (query or x-account-id, x-department-id)",
    });
    return null;
  }
  return scope.data;
}

@injectable()
export class UserController {
  constructor(
    @inject(TYPES.UserService) private readonly users: UserService,
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
    const body = createUserBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.users.create(
        scope.org_id,
        scope.account_id,
        scope.department_id,
        actor.data,
        body.data,
      );
      res.status(201).json({ data });
    } catch (err) {
      if (isHierarchyValidationFailure(err)) {
        res.status(404).json({ error: "invalid account or department hierarchy" });
        return;
      }
      if (isDuplicateKeyError(err)) {
        res.status(409).json({ error: "email already exists for this organization" });
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
      const data = await this.users.list(
        scope.org_id,
        scope.account_id,
        scope.department_id,
      );
      res.status(200).json({ data });
    } catch (err) {
      if (isHierarchyValidationFailure(err)) {
        res.status(404).json({ error: "invalid account or department hierarchy" });
        return;
      }
      throw err;
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const p = userIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const scope = resolveTenantScope(req, res);
    if (!scope) {
      return;
    }
    try {
      const row = await this.users.getById(
        scope.org_id,
        scope.account_id,
        scope.department_id,
        p.data.id,
      );
      if (!row) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ data: row });
    } catch (err) {
      if (isHierarchyValidationFailure(err)) {
        res.status(404).json({ error: "invalid account or department hierarchy" });
        return;
      }
      throw err;
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const p = userIdParamSchema.safeParse(req.params);
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
    const body = updateUserBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.users.update(
        scope.org_id,
        scope.account_id,
        scope.department_id,
        p.data.id,
        actor.data,
        body.data,
      );
      if (!data) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ data });
    } catch (err) {
      if (isHierarchyValidationFailure(err)) {
        res.status(404).json({ error: "invalid account or department hierarchy" });
        return;
      }
      if (isDuplicateKeyError(err)) {
        res.status(409).json({ error: "email already exists for this organization" });
        return;
      }
      throw err;
    }
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const p = userIdParamSchema.safeParse(req.params);
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
      const ok = await this.users.remove(
        scope.org_id,
        scope.account_id,
        scope.department_id,
        p.data.id,
        actor.data,
      );
      if (!ok) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (isHierarchyValidationFailure(err)) {
        res.status(404).json({ error: "invalid account or department hierarchy" });
        return;
      }
      throw err;
    }
  };
}
