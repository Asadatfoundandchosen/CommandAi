import assert from "node:assert/strict";
import { test } from "node:test";
import speakeasy from "speakeasy";

import { BACKUP_CODE_COUNT, buildBackupCodeStatus } from "./backup-codes.service.js";
import { MfaService } from "./mfa.service.js";

const mfa = new MfaService(
  {
    generateBackupCodes: async () => [],
    useBackupCode: async () => false,
    statusFromUser: () => buildBackupCodeStatus(0),
  } as never,
  {
    logMfaEnabled: async () => undefined,
    logMfaDisabled: async () => undefined,
    logMfaVerified: async () => undefined,
  } as never,
);

test("verifyTOTP accepts valid code with window 1", () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32!;
  const token = speakeasy.totp({ secret, encoding: "base32" });
  assert.equal(mfa.verifyTOTP(secret, token), true);
});

test("verifyTOTP rejects invalid code", () => {
  const secret = speakeasy.generateSecret({ length: 20 }).base32!;
  assert.equal(mfa.verifyTOTP(secret, "000000"), false);
});

test("BACKUP_CODE_COUNT is 10", () => {
  assert.equal(BACKUP_CODE_COUNT, 10);
});
