import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InvalidPermissionsError,
  validateRolePermissions,
} from "./permissions.js";

test("validateRolePermissions accepts resource:action:scope", () => {
  const perms = validateRolePermissions(["signals:read:own", "approvals:read:own"]);
  assert.deepEqual(perms, ["signals:read:own", "approvals:read:own"]);
});

test("validateRolePermissions collapses to *:*:* when present", () => {
  const perms = validateRolePermissions(["*:*:*", "signals:read:own"]);
  assert.deepEqual(perms, ["*:*:*"]);
});

test("validateRolePermissions rejects unknown resource", () => {
  assert.throws(
    () => validateRolePermissions(["foo:read:own"]),
    (e) => e instanceof InvalidPermissionsError,
  );
});

test("validateRolePermissions normalizes legacy two-part", () => {
  const perms = validateRolePermissions(["signals:read"]);
  assert.ok(perms.includes("signals:read:own"));
});

test("validateRolePermissions rejects empty list", () => {
  assert.throws(
    () => validateRolePermissions([]),
    (e) => e instanceof InvalidPermissionsError,
  );
});
