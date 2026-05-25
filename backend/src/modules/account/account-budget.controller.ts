import { inject, injectable } from "inversify";
import type { Request, Response } from "express";
import { z } from "zod";

import { TYPES } from "../../types.js";
import {
  AccountNotInOrganizationError,
  OrganizationNotFoundError as HierarchyOrganizationNotFoundError,
} from "../../common/validators/hierarchy.validator.js";
import { AccountAllocationLimitError } from "../credits/credit-allocation.service.js";
import { InsufficientCreditsError } from "../credits/credit.service.js";
import { AccountBudgetService } from "../credits/account-budget.service.js";
import {
  accountActorUserIdSchema,
  accountIdParamSchema,
  allocateBudgetBodySchema,
  patchAccountBudgetLimitBodySchema,
} from "./account.validation.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

function parseActorUserId(req: Request): z.SafeParseReturnType<string, string> {
  const raw = req.headers["x-user-id"];
  const id =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  return accountActorUserIdSchema.safeParse(String(id ?? "").trim());
}

@injectable()
export class AccountBudgetController {
  constructor(
    @inject(TYPES.AccountBudgetService)
    private readonly budgets: AccountBudgetService,
  ) {}

  /** `GET /api/v1/accounts/:id/budget` */
  getBudget = async (req: Request, res: Response): Promise<void> => {
    const p = accountIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    try {
      const data = await this.budgets.getBudget(orgId, p.data.id);
      if (!data) {
        res.status(404).json({ error: "account not found" });
        return;
      }
      res.status(200).json({ data });
    } catch (e) {
      if (e instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found" });
        return;
      }
      throw e;
    }
  };

  /** `POST /api/v1/accounts/:id/budget/allocate` */
  allocateBudget = async (req: Request, res: Response): Promise<void> => {
    const p = accountIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const actor = parseActorUserId(req);
    if (!actor.success) {
      res.status(400).json({
        error: "x-user-id header required (24-char hex ObjectId)",
      });
      return;
    }
    const body = allocateBudgetBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const result = await this.budgets.allocateBudget(
        orgId,
        p.data.id,
        body.data.amount,
        actor.data,
        body.data.description,
      );
      res.status(200).json({
        data: {
          budget: result.budget,
          org_balance: result.allocation.orgBalance,
          transaction_id: result.allocation.transactionId,
        },
      });
    } catch (e) {
      this.handleAllocationError(res, e);
    }
  };

  /** `PATCH /api/v1/accounts/:id/budget/limit` */
  patchLimit = async (req: Request, res: Response): Promise<void> => {
    const p = accountIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const actor = parseActorUserId(req);
    if (!actor.success) {
      res.status(400).json({
        error: "x-user-id header required (24-char hex ObjectId)",
      });
      return;
    }
    const body = patchAccountBudgetLimitBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.budgets.setLimit({
        orgId,
        accountId: p.data.id,
        actorUserId: actor.data,
        limit: body.data.limit,
        warning_threshold: body.data.warning_threshold,
      });
      if (!data) {
        res.status(404).json({ error: "account not found" });
        return;
      }
      res.status(200).json({ data });
    } catch (e) {
      if (e instanceof AccountNotInOrganizationError) {
        res.status(404).json({ error: "account not found" });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to update budget limit";
      res.status(400).json({ error: message });
    }
  };

  private handleAllocationError(res: Response, e: unknown): void {
    if (e instanceof InsufficientCreditsError) {
      res.status(409).json({
        error: "Insufficient org credit balance",
        code: "INSUFFICIENT_ORG_CREDITS",
        requested: e.requested,
        available: e.available,
      });
      return;
    }
    if (e instanceof AccountAllocationLimitError) {
      res.status(409).json({
        error: e.message,
        code: "ACCOUNT_ALLOCATION_LIMIT",
        credit_limit: e.creditLimit,
        allocated_after: e.allocatedAfter,
      });
      return;
    }
    if (e instanceof AccountNotInOrganizationError) {
      res.status(404).json({ error: "account not found" });
      return;
    }
    if (e instanceof HierarchyOrganizationNotFoundError) {
      res.status(404).json({ error: "organization not found" });
      return;
    }
    const message = e instanceof Error ? e.message : "Allocation failed";
    res.status(400).json({ error: message });
  }
}
