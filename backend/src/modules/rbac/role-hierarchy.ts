import type { UserRole } from "@modules/user/user.model.js";

/**
 * Higher roles automatically inherit permissions from lower roles in the chain.
 * `org_admin` > `account_admin` > `dept_manager` > `dept_user`
 */
export const ROLE_HIERARCHY: Record<UserRole, readonly UserRole[]> = {
  org_admin: ["account_admin", "dept_manager", "dept_user"],
  account_admin: ["dept_manager", "dept_user"],
  dept_manager: ["dept_user"],
  dept_user: [],
};

/** Display order: highest privilege first. */
export const ROLE_HIERARCHY_CHAIN: readonly UserRole[] = [
  "org_admin",
  "account_admin",
  "dept_manager",
  "dept_user",
];

export const ROLE_HIERARCHY_LABEL = ROLE_HIERARCHY_CHAIN.join(" > ");

/** Role names whose permissions are merged for a user (assigned role + all lower roles). */
export function getEffectiveRoleNames(role: UserRole | string): UserRole[] {
  if (!isHierarchyRole(role)) {
    return [];
  }
  const inherited = ROLE_HIERARCHY[role];
  return [role, ...inherited];
}

export function isHierarchyRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}

/** True when `actor` is strictly higher in hierarchy than `target`. */
export function roleOutranks(actor: UserRole, target: UserRole): boolean {
  const actorIdx = ROLE_HIERARCHY_CHAIN.indexOf(actor);
  const targetIdx = ROLE_HIERARCHY_CHAIN.indexOf(target);
  return actorIdx >= 0 && targetIdx >= 0 && actorIdx < targetIdx;
}
