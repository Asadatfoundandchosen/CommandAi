import { inject, injectable } from "inversify";
import type { Request, Response } from "express";
import { MongoServerError } from "mongodb";
import { z } from "zod";

import { TYPES } from "../../types.js";
import { AccountBudgetService } from "../credits/account-budget.service.js";
import {
  AccountAllocationLimitError,
  CreditAllocationService,
} from "../credits/credit-allocation.service.js";
import { InsufficientCreditsError } from "../credits/credit.service.js";
import {
  AccountNotInOrganizationError,
  OrganizationNotFoundError as HierarchyOrganizationNotFoundError,
} from "../../common/validators/hierarchy.validator.js";
import {
  AccountService,
  OrganizationNotFoundError,
  PlanLimitExceededError,
} from "./account.service.js";
import {
  accountActorUserIdSchema,
  accountIdParamSchema,
  allocateCreditsBodySchema,
  createAccountBodySchema,
  updateAccountBodySchema,
} from "./account.validation.js";

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

/** Org scope from JWT (`tenantMiddleware`) — never from query alone. */
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
export class AccountController {
  constructor(
    @inject(TYPES.AccountService) private readonly accounts: AccountService,
    @inject(TYPES.CreditAllocationService)
    private readonly creditAllocation: CreditAllocationService,
    @inject(TYPES.AccountBudgetService)
    private readonly accountBudgets: AccountBudgetService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
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
    const body = createAccountBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.accounts.create(orgId, actor.data, body.data);
      res.status(201).json({ data });
    } catch (err) {
      if (err instanceof OrganizationNotFoundError) {
        res.status(404).json({ error: "organization not found" });
        return;
      }
      if (err instanceof PlanLimitExceededError) {
        res.status(409).json({
          error: err.message,
          code: err.code,
          limit: err.limit,
          current: err.current,
        });
        return;
      }
      if (isDuplicateKeyError(err)) {
        res
          .status(409)
          .json({ error: "account name already exists for this organization" });
        return;
      }
      throw err;
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const data = await this.accounts.list(orgId);
    res.status(200).json({ data });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const p = accountIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }
    const row = await this.accounts.getById(orgId, p.data.id);
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(200).json({ data: row });
  };

  update = async (req: Request, res: Response): Promise<void> => {
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
    const body = updateAccountBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const data = await this.accounts.update(
        orgId,
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
      if (isDuplicateKeyError(err)) {
        res
          .status(409)
          .json({ error: "account name already exists for this organization" });
        return;
      }
      throw err;
    }
  };

  /** `POST /api/v1/accounts/:id/allocate` — move credits from org pool to account budget. */
  allocate = async (req: Request, res: Response): Promise<void> => {
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
    const body = allocateCreditsBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    try {
      const result = await this.creditAllocation.allocateToAccount({
        orgId,
        accountId: p.data.id,
        amount: body.data.amount,
        createdBy: actor.data,
        description: body.data.description,
      });
      await this.accountBudgets.syncFromAccount(result.account);
      res.status(200).json({
        data: {
          org_balance: result.orgBalance,
          account: result.account,
          transaction_id: result.transactionId,
        },
      });
    } catch (e) {
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
  };

  remove = async (req: Request, res: Response): Promise<void> => {
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
    const ok = await this.accounts.remove(orgId, p.data.id, actor.data);
    if (!ok) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(204).send();
  };
}
