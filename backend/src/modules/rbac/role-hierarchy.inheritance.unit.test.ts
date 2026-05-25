import assert from "node:assert/strict";
import { test } from "node:test";

import { expandPermissions, hasPermission } from "./permission.js";
import { getEffectiveRoleNames } from "./role-hierarchy.js";
import { SYSTEM_ROLE_DEFINITIONS, getSystemRoleDefinition } from "./system-roles.js";

function mergeRolePermissions(roleName: string): string[] {
  const names = getEffectiveRoleNames(roleName);
  const merged: string[] = [];
  for (const name of names) {
    const def = getSystemRoleDefinition(name);
    if (def) {
      merged.push(...def.permissions);
    }
  }
  return expandPermissions(merged);
}

test("org_admin effective grants include dept_user permissions (inheritance)", () => {
  const orgPerms = mergeRolePermissions("org_admin");
  const deptPerms = mergeRolePermissions("dept_user");

  for (const perm of getSystemRoleDefinition("dept_user")!.permissions) {
    assert.ok(
      orgPerms.some((g) => g === perm) || hasPermission(orgPerms, perm),
      `org_admin should cover ${perm}`,
    );
  }

  assert.ok(orgPerms.length > deptPerms.length);
});

test("org_admin can satisfy org-wide checks", () => {
  const orgPerms = mergeRolePermissions("org_admin");
  assert.equal(hasPermission(orgPerms, "users:manage:organization"), true);
  assert.equal(hasPermission(orgPerms, "accounts:*:organization"), true);
  assert.equal(hasPermission(orgPerms, "signals:read:own"), true);
});

test("dept_user is most restricted in hierarchy", () => {
  const counts = SYSTEM_ROLE_DEFINITIONS.filter((r) =>
    ["org_admin", "account_admin", "dept_manager", "dept_user"].includes(r.name),
  ).map((r) => ({
    name: r.name,
    count: mergeRolePermissions(r.name).length,
  }));

  const dept = counts.find((c) => c.name === "dept_user")!.count;
  for (const row of counts) {
    if (row.name !== "dept_user") {
      assert.ok(row.count > dept, `${row.name} should have more than dept_user`);
    }
  }
});
