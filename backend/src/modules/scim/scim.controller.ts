import { inject, injectable } from "inversify";
import type { Response } from "express";

import type { ScimAuthenticatedRequest } from "./scim-auth.middleware.js";
import { scimError } from "./scim-auth.middleware.js";
import {
  ScimConflictError,
  ScimNotFoundError,
  ScimService,
} from "./scim.service.js";
import type { ScimGroupInput, ScimPatchBody, ScimUserInput } from "./scim.types.js";

function orgId(req: ScimAuthenticatedRequest): string {
  return req.scimOrgId!;
}

function parsePagination(query: Record<string, unknown>): {
  startIndex: number;
  count: number;
} {
  const startIndex = Math.max(Number(query.startIndex ?? 1) || 1, 1);
  const count = Math.max(Number(query.count ?? 100) || 100, 1);
  return { startIndex, count };
}

@injectable()
export class ScimController {
  constructor(@inject(ScimService) private readonly scim: ScimService) {}

  serviceProviderConfig = (_req: ScimAuthenticatedRequest, res: Response): void => {
    res.status(200).json(this.scim.getServiceProviderConfig());
  };

  listUsers = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { startIndex, count } = parsePagination(req.query as Record<string, unknown>);
      const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;
      const data = await this.scim.listUsers(orgId(req), filter, startIndex, count);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  getUser = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = await this.scim.getUser(orgId(req), req.params.id);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  createUser = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = await this.scim.createUser(
        orgId(req),
        req.body as ScimUserInput,
      );
      res.status(201).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  updateUser = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as ScimUserInput | ScimPatchBody;
      const data = await this.scim.updateUser(orgId(req), req.params.id, body);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  deactivateUser = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.scim.deactivateUser(orgId(req), req.params.id);
      res.status(204).send();
    } catch (e) {
      this.handleError(res, e);
    }
  };

  listGroups = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { startIndex, count } = parsePagination(req.query as Record<string, unknown>);
      const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;
      const data = await this.scim.listGroups(orgId(req), filter, startIndex, count);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  getGroup = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = await this.scim.getGroup(orgId(req), req.params.id);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  createGroup = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = await this.scim.createGroup(
        orgId(req),
        req.body as ScimGroupInput,
      );
      res.status(201).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  updateGroup = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as ScimGroupInput | ScimPatchBody;
      const data = await this.scim.updateGroup(orgId(req), req.params.id, body);
      res.status(200).json(data);
    } catch (e) {
      this.handleError(res, e);
    }
  };

  deleteGroup = async (req: ScimAuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await this.scim.deleteGroup(orgId(req), req.params.id);
      res.status(204).send();
    } catch (e) {
      this.handleError(res, e);
    }
  };

  private handleError(res: Response, e: unknown): void {
    if (e instanceof ScimNotFoundError) {
      scimError(res, 404, e.message);
      return;
    }
    if (e instanceof ScimConflictError) {
      scimError(res, 409, e.message, "uniqueness");
      return;
    }
    const message = e instanceof Error ? e.message : "SCIM operation failed";
    scimError(res, 500, message);
  }
}
