import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";
import type { IUser } from "@modules/user/user.model.js";
import mongoose from "mongoose";

import {
  ACCESS_TOKEN_TTL_SEC,
  JwtService,
  REFRESH_TOKEN_TTL_SEC,
} from "./jwt.service.js";

const userId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const accountId = new mongoose.Types.ObjectId();
const deptId = new mongoose.Types.ObjectId();
const now = new Date();

const mockUser: IUser = {
  _id: userId,
  org_id: orgId,
  account_id: accountId,
  department_id: deptId,
  email: "admin@example.com",
  password_hash: "ignored",
  first_name: "Test",
  last_name: "User",
  role: "org_admin",
  status: "active",
  mfa_enabled: false,
  password_change_required: false,
  last_login: null,
  created_by: userId,
  created_at: now,
  updated_by: userId,
  updated_at: now,
  is_deleted: false,
};

const jwtService = new JwtService();
const testSessionId = randomUUID();

test("generateTokens returns access and refresh tokens with correct TTL metadata", () => {
  const tokens = jwtService.generateTokens(mockUser, testSessionId);
  assert.ok(tokens.accessToken.length > 0);
  assert.ok(tokens.refreshToken.length > 0);
  assert.equal(tokens.expiresIn, ACCESS_TOKEN_TTL_SEC);
  assert.ok(tokens.refreshJti.length > 0);
});

test("access and refresh tokens include unique jti claims", () => {
  const tokens = jwtService.generateTokens(mockUser, randomUUID());
  const access = jwt.verify(tokens.accessToken, config.jwt.accessSecret) as jwt.JwtPayload;
  const refresh = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as jwt.JwtPayload;
  assert.equal(typeof access.jti, "string");
  assert.equal(typeof refresh.jti, "string");
  assert.equal(refresh.jti, tokens.refreshJti);
  assert.notEqual(access.jti, refresh.jti);
});

test("access token contains org_id, role, sub and expires in ~15 minutes", () => {
  const { accessToken } = jwtService.generateTokens(mockUser, testSessionId);
  const decoded = jwt.verify(accessToken, config.jwt.accessSecret) as jwt.JwtPayload;
  assert.equal(decoded.sub, String(userId));
  assert.equal(decoded.org_id, String(orgId));
  assert.equal(decoded.role, "org_admin");
  assert.equal(decoded.type, "access");
  assert.equal(typeof decoded.exp, "number");
  assert.equal(typeof decoded.iat, "number");
  const lifetimeSec = (decoded.exp ?? 0) - (decoded.iat ?? 0);
  assert.equal(lifetimeSec, ACCESS_TOKEN_TTL_SEC);
});

test("refresh token expires in ~7 days and omits role", () => {
  const { refreshToken } = jwtService.generateTokens(mockUser, testSessionId);
  const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as jwt.JwtPayload;
  assert.equal(decoded.sub, String(userId));
  assert.equal(decoded.org_id, String(orgId));
  assert.equal(decoded.type, "refresh");
  assert.equal(decoded.role, undefined);
  const lifetimeSec = (decoded.exp ?? 0) - (decoded.iat ?? 0);
  assert.equal(lifetimeSec, REFRESH_TOKEN_TTL_SEC);
});

test("verifyAccessToken rejects refresh tokens", () => {
  const { refreshToken } = jwtService.generateTokens(mockUser, testSessionId);
  assert.throws(() => jwtService.verifyAccessToken(refreshToken));
});

test("verifyRefreshToken rejects access tokens", () => {
  const { accessToken } = jwtService.generateTokens(mockUser, testSessionId);
  assert.throws(() => jwtService.verifyRefreshToken(accessToken));
});

test("access and refresh tokens include matching sid claim", () => {
  const sid = randomUUID();
  const tokens = jwtService.generateTokens(mockUser, sid);
  const access = jwt.verify(tokens.accessToken, config.jwt.accessSecret) as jwt.JwtPayload;
  const refresh = jwt.verify(tokens.refreshToken, config.jwt.refreshSecret) as jwt.JwtPayload;
  assert.equal(access.sid, sid);
  assert.equal(refresh.sid, sid);
  assert.equal(tokens.sessionId, sid);
});

test("verifyRefreshToken rejects refresh tokens without jti", () => {
  const legacy = jwt.sign(
    { sub: String(userId), org_id: String(orgId), type: "refresh" },
    config.jwt.refreshSecret,
    { expiresIn: "7d" },
  );
  assert.throws(() => jwtService.verifyRefreshToken(legacy));
});

test("verifyRefreshToken rejects refresh tokens without sid", () => {
  const legacy = jwt.sign(
    {
      sub: String(userId),
      org_id: String(orgId),
      type: "refresh",
      jti: randomUUID(),
    },
    config.jwt.refreshSecret,
    { expiresIn: "7d" },
  );
  assert.throws(() => jwtService.verifyRefreshToken(legacy));
});
