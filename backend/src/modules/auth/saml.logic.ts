/** SAML attribute keys used by Okta, Azure AD, and OneLogin. */
const EMAIL_ATTRIBUTE_KEYS = [
  "email",
  "Email",
  "mail",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  "urn:oid:0.9.2342.19200300.100.1.3",
] as const;

export type SamlUserLike = {
  name_id?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

/** Resolve login email from SAML assertion (NameID or standard IdP attributes). */
export function extractEmailFromSamlUser(user: SamlUserLike): string | null {
  const attrs = user.attributes ?? {};
  for (const key of EMAIL_ATTRIBUTE_KEYS) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.includes("@")) {
      return value.trim().toLowerCase();
    }
  }

  const nameId = user.name_id?.trim();
  if (nameId && nameId.includes("@")) {
    return nameId.toLowerCase();
  }

  return null;
}

/** Normalize PEM certificate blocks from metadata or admin paste. */
export function normalizePemCertificate(cert: string): string {
  const trimmed = cert.trim();
  if (trimmed.includes("BEGIN CERTIFICATE")) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}
