import assert from "node:assert/strict";
import { test } from "node:test";

import {
  gracePeriodEnd,
  isEnforcementBlocking,
  isGracePeriodActive,
  roleRequiresMfaPolicy,
  userSatisfiesMfaPolicy,
} from "./mfa-policy.logic.js";

test("roleRequiresMfaPolicy — all vs admins vs none", () => {
  assert.equal(roleRequiresMfaPolicy("dept_user", "all"), true);
  assert.equal(roleRequiresMfaPolicy("dept_user", "admins"), false);
  assert.equal(roleRequiresMfaPolicy("org_admin", "admins"), true);
  assert.equal(roleRequiresMfaPolicy("account_admin", "admins"), true);
  assert.equal(roleRequiresMfaPolicy("org_admin", "none"), false);
});

test("userSatisfiesMfaPolicy checks totp and sms", () => {
  assert.equal(
    userSatisfiesMfaPolicy({ mfa_enabled: true }, ["totp"]),
    true,
  );
  assert.equal(
    userSatisfiesMfaPolicy({ mfa_enabled: false, mfa: { sms_enabled: true } }, [
      "sms",
    ]),
    true,
  );
  assert.equal(
    userSatisfiesMfaPolicy({ mfa_enabled: false }, ["totp", "sms"]),
    false,
  );
});

test("grace period blocks only after enforcement_date + grace days", () => {
  const enforcement = new Date("2026-01-01T00:00:00.000Z");
  const graceDays = 14;
  const midGrace = new Date("2026-01-10T00:00:00.000Z");
  const afterGrace = new Date("2026-01-20T00:00:00.000Z");

  assert.equal(isGracePeriodActive(enforcement, graceDays, midGrace), true);
  assert.equal(isEnforcementBlocking(enforcement, graceDays, midGrace), false);
  assert.equal(isGracePeriodActive(enforcement, graceDays, afterGrace), false);
  assert.equal(isEnforcementBlocking(enforcement, graceDays, afterGrace), true);
  assert.equal(
    gracePeriodEnd(enforcement, graceDays).toISOString(),
    "2026-01-15T00:00:00.000Z",
  );
});
