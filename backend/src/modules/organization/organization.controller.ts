import { inject, injectable } from "inversify";
import type { Request, Response } from "express";
import { MongoServerError } from "mongodb";

import { TYPES } from "../../types.js";
import { CreditRatesService } from "../credits/credit-rates.service.js";
import { InvalidStatusTransitionError } from "./organization.status-rules.js";
import { OrganizationService } from "./organization.service.js";
import {
  createOrganizationBodySchema,
  organizationIdParamSchema,
  setOrgCreditRatesBodySchema,
  updateOrganizationBodySchema,
} from "./organization.validation.js";

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

@injectable()
export class OrganizationController {
  constructor(
    @inject(TYPES.OrganizationService)
    private readonly organizations: OrganizationService,
    @inject(TYPES.CreditRatesService)
    private readonly creditRates: CreditRatesService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createOrganizationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.organizations.create(parsed.data);
      res.status(201).json({ data });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({ error: "slug already exists" });
        return;
      }
      throw err;
    }
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.organizations.list();
    res.status(200).json({ data });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const row = await this.organizations.getById(p.data.id);
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(200).json({ data: row });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const body = updateOrganizationBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.organizations.update(p.data.id, body.data);
      if (!data) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json({ data });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({ error: "slug already exists" });
        return;
      }
      if (err instanceof InvalidStatusTransitionError) {
        res.status(400).json({
          error: "invalid status transition",
          from: err.from,
          to: err.to,
        });
        return;
      }
      throw err;
    }
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const ok = await this.organizations.remove(p.data.id);
    if (!ok) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(204).send();
  };

  /** `PUT /api/organizations/:id/credit-rates` — platform admin enterprise custom rates. */
  setCreditRates = async (req: Request, res: Response): Promise<void> => {
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const body = setOrgCreditRatesBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.creditRates.setCustomRatesForOrg(p.data.id, body.data);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to set credit rates";
      res.status(400).json({ error: message });
    }
  };

  /** `DELETE /api/organizations/:id/credit-rates` — revert org to platform default rates. */
  clearCreditRates = async (req: Request, res: Response): Promise<void> => {
    const p = organizationIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const data = await this.creditRates.clearCustomRatesForOrg(p.data.id);
    res.status(200).json({ data });
  };

  /** JWT tenant scope — full Org → Account → Department tree with counts (see `GET /api/v1/organization/hierarchy`). */
  hierarchyForTenant = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "No tenant context" });
      return;
    }
    const data = await this.organizations.getTenantHierarchy(orgId);
    if (!data) {
      res.status(404).json({ error: "organization not found" });
      return;
    }
    res.status(200).json({ data });
  };
}
