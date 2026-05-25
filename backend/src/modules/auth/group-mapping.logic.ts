import type { UserRole } from "@modules/user/user.model.js";

import type { GroupRoleMappingEntry } from "./group-mapping.model.js";
import type { SSOProfile } from "./sso-profile.types.js";

/** Role precedence (highest index wins). */
export const ROLE_PRECEDENCE: readonly UserRole[] = [
  "dept_user",
  "dept_manager",
  "account_admin",
  "org_admin",
] as const;

const GROUP_CLAIM_KEYS = [
  "groups",
  "roles",
  "memberOf",
  "memberof",
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
  "http://schemas.xmlsoap.org/claims/Group",
] as const;

function normalizeGroupValue(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  if (Array.isArray(raw)) {
    return raw
      .flatMap((item) => normalizeGroupValue(item))
      .filter((g) => g.length > 0);
  }
  return [];
}

/** Extract IdP group identifiers from OIDC claims or SAML attributes. */
export function extractIdpGroupsFromSsoProfile(profile: SSOProfile): string[] {
  const found = new Set<string>();

  for (const key of GROUP_CLAIM_KEYS) {
    const raw = profile.attributes[key];
    for (const group of normalizeGroupValue(raw)) {
      found.add(group);
    }
  }

  for (const value of Object.values(profile.attributes)) {
    if (typeof value === "string" && value.startsWith("CN=") && value.includes("OU=")) {
      found.add(value);
    }
  }

  return [...found];
}

export function getHighestRole(roles: UserRole[]): UserRole | null {
  if (roles.length === 0) {
    return null;
  }
  let highest: UserRole = "dept_user";
  let maxIndex = -1;
  for (const role of roles) {
    const index = ROLE_PRECEDENCE.indexOf(role);
    if (index > maxIndex) {
      maxIndex = index;
      highest = role;
    }
  }
  return highest;
}

/** Pick mapping row for assigned role (prefers entry with account + department scope). */
export function pickMappingForRole(
  matched: GroupRoleMappingEntry[],
  role: UserRole,
): GroupRoleMappingEntry | undefined {
  const forRole = matched.filter((m) => m.role === role);
  if (forRole.length === 0) {
    return undefined;
  }
  return (
    forRole.find((m) => m.account_id && m.department_id) ??
    forRole[0]
  );
}
