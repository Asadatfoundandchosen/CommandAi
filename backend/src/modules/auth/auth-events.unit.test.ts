import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_EVENTS } from "./auth-events.js";

test("AUTH_EVENTS defines canonical auth audit action names", () => {
  assert.equal(AUTH_EVENTS.LOGIN_SUCCESS, "auth.login.success");
  assert.equal(AUTH_EVENTS.LOGIN_FAILED, "auth.login.failed");
  assert.equal(AUTH_EVENTS.LOGOUT, "auth.logout");
  assert.equal(AUTH_EVENTS.MFA_DISABLED, "auth.mfa.disabled");
  assert.equal(AUTH_EVENTS.SESSION_REVOKED, "auth.session.revoked");
});
