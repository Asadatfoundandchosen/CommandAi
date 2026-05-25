import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateSecureCode,
  SMS_CODE_LENGTH,
  SMS_RATE_LIMIT_MAX,
  SMS_RATE_LIMIT_WINDOW_SEC,
  smsMfaCodeKey,
  smsMfaRateKey,
} from "./sms-mfa.service.js";
import { validatePhoneNumber } from "./phone.validation.js";

test("generateSecureCode returns 6-digit zero-padded string", () => {
  const code = generateSecureCode(SMS_CODE_LENGTH);
  assert.equal(code.length, SMS_CODE_LENGTH);
  assert.match(code, /^\d{6}$/);
});

test("validatePhoneNumber accepts E.164 and normalizes", () => {
  assert.equal(validatePhoneNumber("+1 (415) 555-2671"), "+14155552671");
});

test("validatePhoneNumber rejects invalid numbers", () => {
  assert.throws(() => validatePhoneNumber("4155552671"));
  assert.throws(() => validatePhoneNumber("+0123456"));
  assert.throws(() => validatePhoneNumber("not-a-phone"));
});

test("sms mfa redis key helpers are namespaced per user", () => {
  assert.equal(smsMfaCodeKey("user1"), "sms_mfa:user1");
  assert.equal(smsMfaRateKey("user1"), "sms_mfa_rate:user1");
});

test("SMS rate limit constants match story (3 per 10 minutes)", () => {
  assert.equal(SMS_RATE_LIMIT_MAX, 3);
  assert.equal(SMS_RATE_LIMIT_WINDOW_SEC, 600);
});
