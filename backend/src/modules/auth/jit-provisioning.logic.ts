import type { SSOProfile } from "./sso-profile.types.js";

/** Common IdP attribute keys for first / last name (OIDC + SAML). */
export const DEFAULT_FIRST_NAME_ATTRS = [
  "given_name",
  "firstName",
  "first_name",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
] as const;

export const DEFAULT_LAST_NAME_ATTRS = [
  "family_name",
  "lastName",
  "last_name",
  "sn",
  "surname",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
] as const;

function readAttr(
  profile: SSOProfile,
  key: string | undefined,
): string | undefined {
  if (!key) {
    return undefined;
  }
  const raw = profile.attributes[key];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) {
    return raw[0].trim();
  }
  return undefined;
}

/** Map a configured attribute key with built-in fallbacks. */
export function mapAttribute(
  profile: SSOProfile,
  configuredAttr: string | undefined,
  fallbacks: readonly string[],
): string {
  const fromConfigured = readAttr(profile, configuredAttr);
  if (fromConfigured) {
    return fromConfigured;
  }
  for (const key of fallbacks) {
    const value = readAttr(profile, key);
    if (value) {
      return value;
    }
  }
  return "";
}

export function mapFirstName(
  profile: SSOProfile,
  configuredAttr?: string,
): string {
  const name = mapAttribute(profile, configuredAttr, DEFAULT_FIRST_NAME_ATTRS);
  return name || profile.email.split("@")[0] || "User";
}

export function mapLastName(
  profile: SSOProfile,
  configuredAttr?: string,
): string {
  const name = mapAttribute(profile, configuredAttr, DEFAULT_LAST_NAME_ATTRS);
  return name || "SSO";
}

export function readDepartmentHint(
  profile: SSOProfile,
  departmentAttr?: string,
): string | undefined {
  return readAttr(profile, departmentAttr);
}
