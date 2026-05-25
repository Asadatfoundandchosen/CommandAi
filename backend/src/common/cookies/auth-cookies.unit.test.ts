import assert from "node:assert/strict";
import { test } from "node:test";

import { config } from "@config/index.js";

import {
  buildClearCookieOptions,
  buildCsrfCookieOptions,
  buildHttpOnlyCookieOptions,
  CSRF_REQUEST_HEADER,
  CSRF_RESPONSE_HEADER,
} from "./auth-cookies.js";

test("httpOnly cookie options enforce XSS protections", () => {
  const opts = buildHttpOnlyCookieOptions(3600_000);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.path, "/");
  assert.equal(opts.secure, config.cookies.secure);
  assert.equal(opts.sameSite, config.cookies.sameSite);
});

test("CSRF cookie is readable by same-origin JS (not httpOnly)", () => {
  const opts = buildCsrfCookieOptions(3600_000);
  assert.equal(opts.httpOnly, false);
  assert.equal(opts.sameSite, config.cookies.sameSite);
});

test("clear cookie options include path and sameSite", () => {
  const opts = buildClearCookieOptions();
  assert.equal(opts.path, "/");
  assert.equal(opts.sameSite, config.cookies.sameSite);
});

test("CSRF header names are stable", () => {
  assert.equal(CSRF_RESPONSE_HEADER, "X-CSRF-Token");
  assert.equal(CSRF_REQUEST_HEADER, "x-csrf-token");
});
