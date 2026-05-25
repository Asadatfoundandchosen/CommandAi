import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ROLE_HIERARCHY,
  getEffectiveRoleNames,
  roleOutranks,
} from "./role-hierarchy.js";

test("getEffectiveRoleNames includes inherited lower roles", () => {
  assert.deepEqual(getEffectiveRoleNames("org_admin"), [
    "org_admin",
    "account_admin",
    "dept_manager",
    "dept_user",
  ]);
  assert.deepEqual(getEffectiveRoleNames("account_admin"), [
    "account_admin",
    "dept_manager",
    "dept_user",
  ]);
  assert.deepEqual(getEffectiveRoleNames("dept_manager"), ["dept_manager", "dept_user"]);
  assert.deepEqual(getEffectiveRoleNames("dept_user"), ["dept_user"]);
});

test("ROLE_HIERARCHY matches story spec", () => {
  assert.deepEqual(ROLE_HIERARCHY.org_admin, [
    "account_admin",
    "dept_manager",
    "dept_user",
  ]);
  assert.deepEqual(ROLE_HIERARCHY.dept_user, []);
});

test("roleOutranks — org_admin outranks dept_user", () => {
  assert.equal(roleOutranks("org_admin", "dept_user"), true);
  assert.equal(roleOutranks("dept_user", "org_admin"), false);
});
