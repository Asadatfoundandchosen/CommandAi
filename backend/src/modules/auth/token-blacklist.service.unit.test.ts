import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";

import {
  blacklistKey,
  tokenTtlSeconds,
  userRevokedKey,
} from "./token-blacklist.service.js";

test("blacklistKey prefixes full JWT string", () => {
  const token = "eyJhbGciOiJIUzI1NiJ9.test";
  assert.equal(blacklistKey(token), `blacklist:${token}`);
});

test("userRevokedKey scopes revocation epoch per user", () => {
  assert.equal(
    userRevokedKey("507f1f77bcf86cd799439011"),
    "auth:revoked:507f1f77bcf86cd799439011",
  );
});

test("tokenTtlSeconds returns remaining lifetime until exp", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { sub: "u1", org_id: "o1", type: "access", exp: now + 900 },
    config.jwt.accessSecret,
  );
  const ttl = tokenTtlSeconds(token);
  assert.ok(ttl !== null && ttl > 0 && ttl <= 900);
});

test("tokenTtlSeconds is null when token already expired", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { sub: "u1", org_id: "o1", type: "access", exp: now - 10 },
    config.jwt.accessSecret,
  );
  const ttl = tokenTtlSeconds(token);
  assert.ok(ttl === null || ttl <= 0);
});
