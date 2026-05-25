/** Map OIDC userinfo / ID token claims to a normalized email for user lookup. */
export function extractEmailFromOidcClaims(
  claims: Record<string, unknown>,
): string | null {
  const candidates = [
    claims.email,
    claims.preferred_username,
    claims.upn,
    claims.unique_name,
  ];

  for (const raw of candidates) {
    if (typeof raw === "string" && raw.includes("@")) {
      return raw.trim().toLowerCase();
    }
  }

  return null;
}

export function parseOidcScopes(scopes?: string): string {
  const trimmed = scopes?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "openid profile email";
}
