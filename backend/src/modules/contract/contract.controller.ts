import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { TYPES } from "../../types.js";
import { ContractService } from "./contract.service.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

@injectable()
export class ContractController {
  constructor(
    @inject(TYPES.ContractService) private readonly contracts: ContractService,
  ) {}

  /** `GET /api/v1/contracts/current` — active contract terms for JWT org (org_admin). */
  getCurrent = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const payload = await this.contracts.getCurrentContract(orgId);
    if (!payload.data) {
      res.status(404).json({
        error: "no active contract",
        data: null,
        expiry_notifications: [],
      });
      return;
    }
    res.status(200).json(payload);
  };
}
