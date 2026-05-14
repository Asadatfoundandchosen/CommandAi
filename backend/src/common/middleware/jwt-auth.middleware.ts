import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { config } from "@config/index.js";

/** JWT access payload — must include `org_id` for tenant-scoped routes. */
export type AccessJwtClaims = JwtPayload & {
  org_id: string;
};

function parseBearer(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : undefined;
}

/** Verifies `Authorization: Bearer <JWT>` with `JWT_ACCESS_SECRET`. Sets `req.user`. */
export function authenticateJwt(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const bearer = parseBearer(req);
    if (!bearer) {
      res.status(401).json({ error: "Authorization Bearer token required" });
      return;
    }
    try {
      const decoded = jwt.verify(
        bearer,
        config.jwt.accessSecret,
      ) as AccessJwtClaims;
      req.user = decoded;
      next();
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
