import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { TYPES } from "../../types.js";
import { UsageService } from "./usage.service.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

@injectable()
export class UsageController {
  constructor(@inject(TYPES.UsageService) private readonly usage: UsageService) {}

  /** `GET /api/v1/usage/summary` — credits used vs allocated, by account, trend. */
  summary = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const data = await this.usage.getUsageSummary(orgId);
    if (!data) {
      res.status(404).json({ error: "organization not found" });
      return;
    }
    res.status(200).json({ data });
  };
}
