import type { Container } from "inversify";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

import { UnauthorizedError } from "@modules/auth/auth.errors.js";
import type { TokenPayload } from "@modules/auth/jwt.service.js";
import { JwtService } from "@modules/auth/jwt.service.js";
import { AuthSessionService } from "@modules/auth/auth-session.service.js";
import { TokenBlacklistService } from "@modules/auth/token-blacklist.service.js";

export type AccessJwtClaims = TokenPayload;

function parseBearer(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : undefined;
}

function decodeClaimsUnsafe(token: string): TokenPayload | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string") {
    return null;
  }
  return decoded as TokenPayload;
}

/**
 * Verifies Bearer access JWT, checks Redis blacklist on every request, and sets `req.user`.
 */
export function createAuthenticateJwt(container: Container): RequestHandler {
  const jwtService = container.get(JwtService);
  const tokenBlacklist = container.get(TokenBlacklistService);
  const authSessions = container.get(AuthSessionService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bearer = parseBearer(req);
    if (!bearer) {
      res.status(401).json({ error: "Authorization Bearer token required" });
      return;
    }
    try {
      const preClaims = decodeClaimsUnsafe(bearer);
      if (preClaims?.sub) {
        const issuedAt =
          typeof preClaims.iat === "number"
            ? preClaims.iat
            : Math.floor(Date.now() / 1000);
        const revoked = await tokenBlacklist.checkRevoked(
          bearer,
          preClaims.sub,
          issuedAt,
        );
        if (revoked.blacklisted || revoked.userRevoked) {
          res.status(401).json({ error: new UnauthorizedError().message });
          return;
        }
      }

      const decoded = jwtService.verifyAccessToken(bearer);
      req.user = decoded;
      if (typeof decoded.sid === "string" && decoded.sid.length > 0) {
        void authSessions.touchLastActive(decoded.sid, decoded.sub).catch(() => {
          /* non-blocking session heartbeat */
        });
      }
      next();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        res.status(401).json({ error: e.message });
        return;
      }
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

/**
 * @deprecated Use `createAuthenticateJwt(container)` so blacklist checks run on every request.
 */
export function authenticateJwt(): RequestHandler {
  const jwtService = new JwtService();
  return (req: Request, res: Response, next: NextFunction): void => {
    const bearer = parseBearer(req);
    if (!bearer) {
      res.status(401).json({ error: "Authorization Bearer token required" });
      return;
    }
    try {
      const decoded = jwtService.verifyAccessToken(bearer);
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
