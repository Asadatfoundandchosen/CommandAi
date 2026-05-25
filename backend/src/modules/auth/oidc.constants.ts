/** Redis TTL for OIDC PKCE verifier (authorization code flow). */
export const OIDC_PKCE_TTL_SEC = 600;

export const OIDC_PKCE_KEY_PREFIX = "oidc:pkce:" as const;

export const DEFAULT_OIDC_SCOPES = "openid profile email" as const;

/** Well-known issuer URLs (configure via org admin PUT /api/v1/organization/oidc). */
export const OIDC_ISSUER_HINTS = {
  google: "https://accounts.google.com",
  microsoft: "https://login.microsoftonline.com/{tenant}/v2.0",
} as const;
