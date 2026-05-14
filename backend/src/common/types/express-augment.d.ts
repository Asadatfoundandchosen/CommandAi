import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticateJwt` — JWT payload (must include `org_id` for tenant APIs). */
      user?: JwtPayload & { org_id?: string };
      /** Canonical org ObjectId hex from JWT (`tenantMiddleware`). */
      tenantId?: string;
    }
  }
}

export {};
