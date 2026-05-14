import assert from "node:assert/strict";
import { test } from "node:test";

import {
  rejectCrossTenantOrgHint,
  tenantMiddleware,
} from "./tenant.middleware.js";

const VALID_ORG = "507f1f77bcf86cd799439011";
const OTHER_ORG = "507f191e810c19729de860ea";

test("tenantMiddleware sets req.tenantId from JWT user.org_id", () => {
  const req = {
    user: { org_id: VALID_ORG, sub: "user1" },
  } as import("express").Request;
  let nextCalls = 0;
  tenantMiddleware(req, {} as import("express").Response, () => {
    nextCalls += 1;
  });
  assert.equal(req.tenantId, VALID_ORG.toLowerCase());
  assert.equal(nextCalls, 1);
});

test("tenantMiddleware returns 401 when org_id missing", () => {
  const req = { user: { sub: "x" } } as import("express").Request;
  let status = 0;
  let payload: unknown;
  const res = {
    status(code: number) {
      status = code;
      return {
        json(body: unknown) {
          payload = body;
        },
      };
    },
  } as unknown as import("express").Response;
  let nextCalls = 0;
  tenantMiddleware(req, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(status, 401);
  assert.deepEqual(payload, { error: "No tenant context" });
});

test("rejectCrossTenantOrgHint returns 403 when query org_id mismatches tenant", () => {
  const handler = rejectCrossTenantOrgHint();
  const req = {
    tenantId: VALID_ORG,
    query: { org_id: OTHER_ORG },
    headers: {},
  } as unknown as import("express").Request;
  let status = 0;
  let payload: unknown;
  const res = {
    status(code: number) {
      status = code;
      return {
        json(body: unknown) {
          payload = body;
        },
      };
    },
  } as unknown as import("express").Response;
  let nextCalls = 0;
  handler(req, res, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(status, 403);
  assert.deepEqual(payload, { error: "Cross-tenant access denied" });
});

test("rejectCrossTenantOrgHint calls next when org hints align", () => {
  const handler = rejectCrossTenantOrgHint();
  const req = {
    tenantId: VALID_ORG,
    query: { org_id: VALID_ORG },
    headers: {},
  } as unknown as import("express").Request;
  let nextCalls = 0;
  handler(req, {} as import("express").Response, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 1);
});
