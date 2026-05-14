import { inject, injectable } from "inversify";

import { TYPES } from "../../types.js";
import { AccountRepository } from "../../modules/account/account.repository.js";
import { DepartmentRepository } from "../../modules/department/department.repository.js";
import { OrganizationRepository } from "../../modules/organization/organization.repository.js";

/** Parent organization missing or invalid id. */
export class OrganizationNotFoundError extends Error {
  constructor(public readonly orgId: string) {
    super(`Organization not found: ${orgId}`);
    this.name = "OrganizationNotFoundError";
  }
}

/** Account does not exist under the given org (wrong account or wrong org). */
export class AccountNotInOrganizationError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly accountId: string,
  ) {
    super(`Account not found under organization: org=${orgId} account=${accountId}`);
    this.name = "AccountNotInOrganizationError";
  }
}

/** Department does not exist under the given org + account chain. */
export class DepartmentNotInAccountError extends Error {
  constructor(
    public readonly orgId: string,
    public readonly accountId: string,
    public readonly departmentId: string,
  ) {
    super(
      `Department not found under account: org=${orgId} account=${accountId} department=${departmentId}`,
    );
    this.name = "DepartmentNotInAccountError";
  }
}

/**
 * Validates multi-tenant hierarchy: **Organization → Account → Department → User**.
 * Use on create/update (and read paths that must confirm parents exist).
 */
@injectable()
export class HierarchyValidator {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.DepartmentRepository)
    private readonly departments: DepartmentRepository,
  ) {}

  async assertOrganizationExists(orgId: string): Promise<void> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new OrganizationNotFoundError(orgId);
    }
  }

  /** Account document exists and its `org_id` matches. */
  async assertAccountBelongsToOrg(accountId: string, orgId: string): Promise<void> {
    const account = await this.accounts.findByIdForOrg(accountId, orgId);
    if (!account) {
      throw new AccountNotInOrganizationError(orgId, accountId);
    }
  }

  /** Department exists under the org + account scope. */
  async assertDepartmentBelongsToAccount(
    departmentId: string,
    orgId: string,
    accountId: string,
  ): Promise<void> {
    await this.assertAccountBelongsToOrg(accountId, orgId);
    const dept = await this.departments.findByIdForScope(
      departmentId,
      orgId,
      accountId,
    );
    if (!dept) {
      throw new DepartmentNotInAccountError(orgId, accountId, departmentId);
    }
  }

  /** Full chain for user placement (account ∈ org, department ∈ account). */
  async assertUserHierarchy(
    orgId: string,
    accountId: string,
    departmentId: string,
  ): Promise<void> {
    await this.assertAccountBelongsToOrg(accountId, orgId);
    const dept = await this.departments.findByIdForScope(
      departmentId,
      orgId,
      accountId,
    );
    if (!dept) {
      throw new DepartmentNotInAccountError(orgId, accountId, departmentId);
    }
  }
}
