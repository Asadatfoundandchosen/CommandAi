import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { PlanLimitExceededError } from "../../common/validators/plan-limits.validator.js";
import { TYPES } from "../../types.js";
import { PlanService } from "./plan.service.js";
import { changePlanBodySchema } from "./plan.validation.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

@injectable()
export class PlanController {
  constructor(@inject(TYPES.PlanService) private readonly plans: PlanService) {}

  /** `GET /api/v1/plans` — public catalog of subscription tiers. */
  list = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ data: this.plans.listCatalog() });
  };

  /** `GET /api/v1/plans/current` — org-scoped plan + usage (JWT). */
  getCurrent = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const data = await this.plans.getOrgPlan(orgId);
    if (!data) {
      res.status(404).json({ error: "organization not found" });
      return;
    }
    res.status(200).json({ data });
  };

  /** `POST /api/v1/plans/change` — upgrade or downgrade (JWT org_admin). */
  change = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const parsed = changePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await this.plans.changePlan(
        orgId,
        parsed.data.tier,
        parsed.data.billing_cycle,
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof PlanLimitExceededError) {
        res.status(409).json({
          error: e.message,
          code: e.code,
          limit: e.limit,
          current: e.current,
        });
        return;
      }
      const message = e instanceof Error ? e.message : "Plan change failed";
      res.status(400).json({ error: message });
    }
  };
}
