import type { TokenPayload } from "@modules/auth/jwt.service.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticateJwt` — access JWT payload (`org_id`, `role`, `sub`). */
      user?: TokenPayload;
      /** Canonical org ObjectId hex from JWT (`tenantMiddleware`). */
      tenantId?: string;
      /** Effective RBAC grants (`resource:action:scope`) from `createLoadUserPermissionsMiddleware`. */
      userPermissions?: string[];
      /** Set by `createApiKeyAuthMiddleware` when `X-API-Key` / Bearer `1cmd_…` is valid. */
      apiKeyId?: string;
      apiKeyAccountId?: string | null;
      apiKeyRateLimit?: number;
    }
  }
}

export {};
