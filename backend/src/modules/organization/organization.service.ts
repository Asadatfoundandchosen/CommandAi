import { inject, injectable } from "inversify";

import { AccountRepository } from "../account/account.repository.js";
import { DepartmentRepository } from "../department/department.repository.js";
import { UserRepository } from "../user/user.repository.js";
import { TYPES } from "../../types.js";
import type { IAccount } from "../account/account.model.js";
import type { IDepartment } from "../department/department.model.js";
import type { IOrganization } from "./organization.model.js";
import {
  OrganizationRepository,
  type CreateOrganizationDoc,
} from "./organization.repository.js";
import { assertValidStatusTransition } from "./organization.status-rules.js";

/** Dashboard tree: Org → Accounts → Departments; users counted per department. */
export type TenantHierarchyDepartmentNode = {
  id: string;
  name: string;
  status: IDepartment["status"];
  counts: { users: number };
};

export type TenantHierarchyAccountNode = {
  id: string;
  name: string;
  status: IAccount["status"];
  counts: { departments: number; users: number };
  departments: TenantHierarchyDepartmentNode[];
};

export type TenantHierarchyTree = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: IOrganization["status"];
    counts: {
      accounts: number;
      departments: number;
      users: number;
    };
  };
  accounts: TenantHierarchyAccountNode[];
};

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  status?: IOrganization["status"];
  settings?: Partial<IOrganization["settings"]>;
};

export type UpdateOrganizationInput = Partial<{
  name: string;
  slug: string;
  status: IOrganization["status"];
  settings: Partial<IOrganization["settings"]>;
}>;

@injectable()
export class OrganizationService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.DepartmentRepository)
    private readonly departments: DepartmentRepository,
    @inject(TYPES.UserRepository)
    private readonly users: UserRepository,
  ) {}

  async create(input: CreateOrganizationInput): Promise<IOrganization> {
    const doc: CreateOrganizationDoc = {
      name: input.name,
      slug: input.slug,
      status: input.status ?? "trial",
      settings: {
        timezone: input.settings?.timezone ?? "UTC",
        locale: input.settings?.locale ?? "en",
        features: input.settings?.features ?? [],
      },
      subscription: {
        tier: "starter",
      },
    };
    return this.organizations.create(doc);
  }

  async getById(id: string): Promise<IOrganization | null> {
    return this.organizations.findById(id);
  }

  async list(): Promise<IOrganization[]> {
    return this.organizations.list();
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<IOrganization | null> {
    const existing = await this.organizations.findById(id);
    if (!existing) {
      return null;
    }
    const setDoc: Record<string, unknown> = {};
    if (input.name !== undefined) {
      setDoc.name = input.name;
    }
    if (input.slug !== undefined) {
      setDoc.slug = input.slug;
    }
    if (input.status !== undefined) {
      assertValidStatusTransition(existing.status, input.status);
      setDoc.status = input.status;
    }
    if (input.settings !== undefined) {
      setDoc.settings = {
        ...existing.settings,
        ...input.settings,
      };
    }
    if (Object.keys(setDoc).length === 0) {
      return existing;
    }
    return this.organizations.updateById(id, { $set: setDoc });
  }

  async remove(id: string): Promise<boolean> {
    return this.organizations.deleteById(id);
  }

  /**
   * Full tenant hierarchy for dashboard (JWT org scope only).
   * Includes cumulative counts at org, account, and department levels.
   */
  async getTenantHierarchy(orgId: string): Promise<TenantHierarchyTree | null> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      return null;
    }

    const accountRows = await this.accounts.listForOrg(orgId);
    const usersByDept = await this.users.countActiveUsersByDepartmentForOrg(orgId);

    let totalDepartments = 0;
    const accounts: TenantHierarchyAccountNode[] = [];

    for (const acc of accountRows) {
      const accountId = String(acc._id);
      const deptRows = await this.departments.listForScope(orgId, accountId);
      totalDepartments += deptRows.length;

      let usersInAccount = 0;
      const departments: TenantHierarchyDepartmentNode[] = deptRows.map((d) => {
        const deptId = String(d._id);
        const userCount = usersByDept.get(deptId) ?? 0;
        usersInAccount += userCount;
        return {
          id: deptId,
          name: d.name,
          status: d.status,
          counts: { users: userCount },
        };
      });

      accounts.push({
        id: accountId,
        name: acc.name,
        status: acc.status,
        counts: {
          departments: deptRows.length,
          users: usersInAccount,
        },
        departments,
      });
    }

    const totalUsers = [...usersByDept.values()].reduce((sum, n) => sum + n, 0);

    return {
      organization: {
        id: String(org._id),
        name: org.name,
        slug: org.slug,
        status: org.status,
        counts: {
          accounts: accounts.length,
          departments: totalDepartments,
          users: totalUsers,
        },
      },
      accounts,
    };
  }
}
