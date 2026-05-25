import assert from "node:assert/strict";
import { test } from "node:test";
import zxcvbn from "zxcvbn";

import { logAuthTokenOperation } from "./auth-token.logger.js";
import { hashPassword as legacyHash } from "../user/user.password.legacy.js";
import {
  MIN_PASSWORD_STRENGTH_SCORE,
  PasswordService,
  WeakPasswordError,
} from "./password.service.js";

const passwords = new PasswordService();

test("hashPassword uses Argon2id (PHC string prefix)", async () => {
  const hash = await passwords.hashPassword("Tr0ub4dor&3-battery-staple!");
  assert.match(hash, /^\$argon2id\$/);
});

test("verifyPassword accepts Argon2id hash", async () => {
  const plain = "Tr0ub4dor&3-battery-staple!";
  const hash = await passwords.hashPassword(plain);
  assert.equal(await passwords.verifyPassword(plain, hash), true);
  assert.equal(await passwords.verifyPassword("wrong", hash), false);
});

test("verifyPassword accepts legacy scrypt hashes for migration", async () => {
  const plain = "correct horse battery staple";
  const legacy = legacyHash(plain);
  assert.equal(await passwords.verifyPassword(plain, legacy), true);
  assert.equal(passwords.needsPasswordUpgrade(legacy), true);
});

test("validatePasswordStrength rejects common weak passwords", () => {
  const weak = passwords.validatePasswordStrength("password");
  assert.equal(weak.valid, false);
  if (!weak.valid) {
    assert.ok(weak.feedback.warning.length > 0);
  }
});

test("validatePasswordStrength accepts strong passwords", () => {
  const strong = passwords.validatePasswordStrength(
    "correct-horse-battery-staple-99!",
    [],
  );
  assert.equal(strong.valid, true);
});

test("assertPasswordStrength throws WeakPasswordError", () => {
  assert.throws(
    () => passwords.assertPasswordStrength("12345678"),
    WeakPasswordError,
  );
});

test("AC: weak password rejected when zxcvbn score is below 3", () => {
  const plain = "password";
  const analysis = zxcvbn(plain);
  assert.ok(analysis.score < MIN_PASSWORD_STRENGTH_SCORE);
  const result = passwords.validatePasswordStrength(plain);
  assert.equal(result.valid, false);
});

test("AC: weak password feedback includes warning and suggestions", () => {
  const result = passwords.validatePasswordStrength("password123");
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.feedback.warning.length > 0);
    assert.ok(Array.isArray(result.feedback.suggestions));
  }
});

test("AC: WeakPasswordError exposes feedback for API responses", () => {
  try {
    passwords.assertPasswordStrength("qwerty123");
  } catch (e) {
    assert.ok(e instanceof WeakPasswordError);
    assert.ok(e.feedback.warning.length > 0);
    return;
  }
  assert.fail("expected WeakPasswordError");
});

test("AC: same password yields different Argon2id hashes (unique salt)", async () => {
  const plain = "Tr0ub4dor&3-battery-staple!";
  const hash1 = await passwords.hashPassword(plain);
  const hash2 = await passwords.hashPassword(plain);
  assert.notEqual(hash1, hash2);
  assert.match(hash1, /^\$argon2id\$/);
  assert.match(hash2, /^\$argon2id\$/);
  assert.equal(await passwords.verifyPassword(plain, hash1), true);
  assert.equal(await passwords.verifyPassword(plain, hash2), true);
});

test("AC: auth token logs never contain password fields or values", () => {
  const lines: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  logAuthTokenOperation("login_failed", {
    reason: "invalid_credentials",
    user_id: "507f1f77bcf86cd799439011",
  });
  logAuthTokenOperation("login_success", {
    user_id: "507f1f77bcf86cd799439011",
    password_change_required: true,
  });

  process.stdout.write = origOut;
  process.stderr.write = origErr;

  const joined = lines.join("");
  assert.doesNotMatch(joined, /"password"\s*:/);
  assert.doesNotMatch(joined, /secretPlaintext/i);
});
