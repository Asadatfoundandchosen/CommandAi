import assert from "node:assert/strict";
import { test } from "node:test";

import { CSRF_REQUEST_HEADER } from "../cookies/auth-cookies.js";
import { createCsrfMiddleware } from "./csrf.middleware.js";

function mockReqRes(
  method: string,
  path: string,
  options?: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    baseUrl?: string;
  },
) {
  let statusCode = 200;
  let body: unknown;
  const req = {
    method,
    path,
    baseUrl: options?.baseUrl ?? "",
    cookies: options?.cookies ?? {},
    get(name: string) {
      const key = name.toLowerCase();
      return options?.headers?.[key];
    },
  } as import("express").Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as import("express").Response;

  return { req, res, getStatus: () => statusCode, getBody: () => body };
}

test("CSRF skipped for GET requests", () => {
  const mw = createCsrfMiddleware();
  const { req, res, getStatus } = mockReqRes("GET", "/api/v1/users", {
    cookies: { refresh_token: "x", "1cmd_csrf": "tok" },
  });
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(getStatus(), 200);
});

test("CSRF skipped for login (exempt path)", () => {
  const mw = createCsrfMiddleware();
  const { req, res } = mockReqRes("POST", "/api/v1/auth/login", {
    cookies: { "1cmd_csrf": "tok" },
  });
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("CSRF required when auth cookies present on mutation", () => {
  const mw = createCsrfMiddleware();
  const { req, res, getStatus, getBody } = mockReqRes("POST", "/api/v1/users", {
    cookies: {
      refresh_token: "jwt-refresh",
      "1cmd_csrf": "csrf-abc",
    },
    headers: {},
  });
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
  assert.equal((getBody() as { code: string }).code, "csrf_failed");
});

test("CSRF passes when header matches cookie", () => {
  const mw = createCsrfMiddleware();
  const { req, res } = mockReqRes("DELETE", "/api/v1/auth/sessions/abc", {
    cookies: { refresh_token: "r", "1cmd_csrf": "match-me" },
    headers: { [CSRF_REQUEST_HEADER]: "match-me" },
  });
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("Bearer-only mutation without cookies skips CSRF", () => {
  const mw = createCsrfMiddleware();
  const { req, res } = mockReqRes("POST", "/api/v1/users", {
    headers: { authorization: "Bearer access-jwt" },
  });
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
