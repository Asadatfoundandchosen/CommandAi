import { randomUUID } from "node:crypto";
import { injectable } from "inversify";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";
import type { IUser } from "@modules/user/user.model.js";

/** JWT claims shared by access and refresh tokens. */
export interface TokenPayload {
  sub: string;
  org_id: string;
  account_id?: string;
  department_id?: string;
  role?: string;
  type: "access" | "refresh";
  /** Unique token id — required on refresh tokens for rotation / reuse detection. */
  jti?: string;
  /** Auth session id — links access/refresh tokens to Redis session tracking. */
  sid?: string;
  /** Issued-at (seconds since epoch) — set by `jsonwebtoken`. */
  iat?: number;
  exp?: number;
}

export type RefreshTokenClaims = Pick<
  TokenPayload,
  "sub" | "org_id" | "type" | "jti" | "sid" | "iat"
> & { jti: string; sid: string };

export const ACCESS_TOKEN_EXPIRES_IN = "15m" as const;
export const REFRESH_TOKEN_EXPIRES_IN = "7d" as const;
/** Access token lifetime in seconds (15 minutes). */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
/** Refresh token lifetime in seconds (7 days). */
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/** Issued token pair plus refresh JTI / session id for Redis (not sent to clients). */
export type AuthTokenPair = AuthTokens & { refreshJti: string; sessionId: string };

@injectable()
export class JwtService {
  generateTokens(user: IUser, sessionId: string): AuthTokenPair {
    const sub = String(user._id);
    const org_id = String(user.org_id);
    const account_id = String(user.account_id);
    const department_id = String(user.department_id);
    const accessJti = randomUUID();
    const refreshJti = randomUUID();

    const accessToken = jwt.sign(
      {
        sub,
        org_id,
        account_id,
        department_id,
        role: user.role,
        type: "access",
        jti: accessJti,
        sid: sessionId,
      } satisfies TokenPayload,
      config.jwt.accessSecret,
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );

    const refreshToken = jwt.sign(
      {
        sub,
        org_id,
        type: "refresh",
        jti: refreshJti,
        sid: sessionId,
      } satisfies RefreshTokenClaims,
      config.jwt.refreshSecret,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      refreshJti,
      sessionId,
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
    if (decoded.type !== "access") {
      throw new jwt.JsonWebTokenError("Invalid token type");
    }
    return decoded;
  }

  verifyRefreshToken(token: string): RefreshTokenClaims {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
    if (decoded.type !== "refresh") {
      throw new jwt.JsonWebTokenError("Invalid token type");
    }
    if (typeof decoded.jti !== "string" || decoded.jti.length === 0) {
      throw new jwt.JsonWebTokenError("Refresh token missing jti");
    }
    if (typeof decoded.sid !== "string" || decoded.sid.length === 0) {
      throw new jwt.JsonWebTokenError("Refresh token missing sid");
    }
    return decoded as RefreshTokenClaims;
  }
}
