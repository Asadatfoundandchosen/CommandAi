import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasPermission,
  normalizePermission,
  scopeIncludes,
  buildPermission,
} from "./permission.js";

test("scopeIncludes — organization grant covers account requirement", () => {
  assert.equal(scopeIncludes("organization", "account"), true);
  assert.equal(scopeIncludes("account", "organization"), false);
});

test("hasPermission matches resource:action:scope", () => {
  const grants = [buildPermission("agents", "read", "account")];
  assert.equal(hasPermission(grants, "agents:read:account"), true);
  assert.equal(hasPermission(grants, "agents:update:account"), false);
});

test("hasPermission — wildcard action", () => {
  const grants = [buildPermission("signals", "*", "organization")];
  assert.equal(hasPermission(grants, "signals:read:organization"), true);
  assert.equal(hasPermission(grants, "signals:delete:organization"), true);
});

test("hasPermission — global grant", () => {
  assert.equal(hasPermission(["*:*:*"], "contracts:read:organization"), true);
});

test("normalizePermission maps legacy shorthand", () => {
  assert.equal(normalizePermission("signals:read"), "signals:read:own");
  assert.equal(normalizePermission("*"), "*:*:*");
});

test("hasPermission — broader scope satisfies narrower", () => {
  const grants = [buildPermission("approvals", "read", "department")];
  assert.equal(hasPermission(grants, "approvals:read:own"), true);
});
