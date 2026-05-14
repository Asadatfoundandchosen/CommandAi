import assert from "node:assert/strict";
import { test } from "node:test";

import type { AccountRepository } from "../../modules/account/account.repository.js";
import type { DepartmentRepository } from "../../modules/department/department.repository.js";
import type { OrganizationRepository } from "../../modules/organization/organization.repository.js";
import {
  AccountNotInOrganizationError,
  DepartmentNotInAccountError,
  HierarchyValidator,
  OrganizationNotFoundError,
} from "./hierarchy.validator.js";

const ORG = "507f1f77bcf86cd799439011";
const ACCOUNT = "507f1f77bcf86cd799439012";
const DEPT = "507f1f77bcf86cd799439013";

function makeValidator(stubs: {
  org?: unknown | null;
  account?: unknown | null;
  department?: unknown | null;
}): HierarchyValidator {
  const organizations = {
    async findById() {
      return stubs.org ?? null;
    },
  } as unknown as OrganizationRepository;

  const accounts = {
    async findByIdForOrg() {
      return stubs.account ?? null;
    },
  } as unknown as AccountRepository;

  const departments = {
    async findByIdForScope() {
      return stubs.department ?? null;
    },
  } as unknown as DepartmentRepository;

  return new HierarchyValidator(organizations, accounts, departments);
}

test("assertOrganizationExists throws when org missing", async () => {
  const v = makeValidator({ org: null });
  await assert.rejects(() => v.assertOrganizationExists(ORG), OrganizationNotFoundError);
});

test("assertOrganizationExists resolves when org present", async () => {
  const v = makeValidator({ org: { _id: ORG } });
  await assert.doesNotReject(() => v.assertOrganizationExists(ORG));
});

test("assertAccountBelongsToOrg throws when account not in org", async () => {
  const v = makeValidator({ account: null });
  await assert.rejects(
    () => v.assertAccountBelongsToOrg(ACCOUNT, ORG),
    AccountNotInOrganizationError,
  );
});

test("assertAccountBelongsToOrg resolves when account scoped to org", async () => {
  const v = makeValidator({ account: { _id: ACCOUNT, org_id: ORG } });
  await assert.doesNotReject(() => v.assertAccountBelongsToOrg(ACCOUNT, ORG));
});

test("assertDepartmentBelongsToAccount throws when department not under account", async () => {
  const v = makeValidator({
    account: { _id: ACCOUNT, org_id: ORG },
    department: null,
  });
  await assert.rejects(
    () => v.assertDepartmentBelongsToAccount(DEPT, ORG, ACCOUNT),
    DepartmentNotInAccountError,
  );
});

test("assertDepartmentBelongsToAccount resolves when chain valid", async () => {
  const v = makeValidator({
    account: { _id: ACCOUNT, org_id: ORG },
    department: { _id: DEPT },
  });
  await assert.doesNotReject(() =>
    v.assertDepartmentBelongsToAccount(DEPT, ORG, ACCOUNT),
  );
});

test("assertUserHierarchy rejects wrong account before department lookup", async () => {
  let deptCalls = 0;
  const organizations = {} as unknown as OrganizationRepository;

  const accounts = {
    async findByIdForOrg() {
      return null;
    },
  } as unknown as AccountRepository;

  const departments = {
    async findByIdForScope() {
      deptCalls += 1;
      return { _id: DEPT };
    },
  } as unknown as DepartmentRepository;

  const v = new HierarchyValidator(organizations, accounts, departments);
  await assert.rejects(
    () => v.assertUserHierarchy(ORG, ACCOUNT, DEPT),
    AccountNotInOrganizationError,
  );
  assert.equal(deptCalls, 0);
});

test("assertUserHierarchy resolves when account and department match scope", async () => {
  const v = makeValidator({
    account: { _id: ACCOUNT, org_id: ORG },
    department: { _id: DEPT },
  });
  await assert.doesNotReject(() => v.assertUserHierarchy(ORG, ACCOUNT, DEPT));
});
