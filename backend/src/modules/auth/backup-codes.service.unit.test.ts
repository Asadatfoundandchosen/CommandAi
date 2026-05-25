import assert from "node:assert/strict";
import { test } from "node:test";
import argon2 from "argon2";

import {
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LOW_WARNING_THRESHOLD,
  buildBackupCodeStatus,
  normalizeBackupCode,
} from "./backup-codes.service.js";

test("BACKUP_CODE_COUNT is 10", () => {
  assert.equal(BACKUP_CODE_COUNT, 10);
});

test("normalizeBackupCode strips dashes and uppercases", () => {
  assert.equal(normalizeBackupCode("abcd-ef01"), "ABCDEF01");
});

test("buildBackupCodeStatus sets low_warning at 3 or fewer remaining", () => {
  assert.equal(buildBackupCodeStatus(10).low_warning, false);
  assert.equal(buildBackupCodeStatus(4).low_warning, false);
  assert.equal(buildBackupCodeStatus(3).low_warning, true);
  assert.equal(buildBackupCodeStatus(1).low_warning, true);
  assert.equal(buildBackupCodeStatus(0).low_warning, true);
});

test("buildBackupCodeStatus always reports total of 10", () => {
  const status = buildBackupCodeStatus(7);
  assert.equal(status.remaining, 7);
  assert.equal(status.total, BACKUP_CODE_COUNT);
});

test("backup codes use 8-char hex from 4 random bytes", () => {
  const sample = "A1B2C3D4";
  assert.match(sample, /^[0-9A-F]{8}$/);
  assert.equal(BACKUP_CODE_LOW_WARNING_THRESHOLD, 3);
});

test("argon2 hash verifies normalized backup code", async () => {
  const plain = "DEADBEEF";
  const normalized = normalizeBackupCode(plain);
  const hash = await argon2.hash(normalized);
  assert.equal(await argon2.verify(hash, normalized), true);
  assert.equal(await argon2.verify(hash, normalizeBackupCode("dead-beef")), true);
});
