/** Built-in hierarchy roles (org_id null, is_system true). */
export const SYSTEM_ROLE_DEFINITIONS = [
  {
    name: "platform_admin",
    display_name: "Platform Admin",
    description: "Full platform access across all organizations",
    hierarchy_level: 0,
    permissions: ["*:*:*"],
  },
  {
    name: "org_admin",
    display_name: "Organization Admin",
    description: "Full access within an organization",
    hierarchy_level: 1,
    permissions: [
      "organizations:manage:organization",
      "accounts:*:organization",
      "departments:*:organization",
      "users:*:organization",
      "agents:*:organization",
      "signals:*:organization",
      "approvals:*:organization",
      "playbooks:*:organization",
      "credits:*:organization",
      "contracts:*:organization",
      "audit:*:organization",
    ],
  },
  {
    name: "account_admin",
    display_name: "Account Admin",
    description: "Manage accounts, departments, and users within an account",
    hierarchy_level: 2,
    permissions: [
      "accounts:manage:account",
      "departments:*:account",
      "users:*:account",
      "agents:*:account",
      "signals:*:account",
      "approvals:*:account",
      "playbooks:*:account",
      "credits:read:account",
    ],
  },
  {
    name: "dept_manager",
    display_name: "Department Manager",
    description: "Manage department resources and agents",
    hierarchy_level: 3,
    permissions: [
      "departments:manage:department",
      "users:read:department",
      "agents:*:department",
      "signals:read:department",
      "approvals:*:department",
    ],
  },
  {
    name: "dept_user",
    display_name: "Department User",
    description: "Standard user — signals and own approvals",
    hierarchy_level: 4,
    permissions: ["signals:read:own", "approvals:read:own"],
  },
] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_DEFINITIONS)[number]["name"];

export const SYSTEM_ROLE_NAMES: readonly string[] = SYSTEM_ROLE_DEFINITIONS.map(
  (r) => r.name,
);

export function isSystemRoleName(name: string): boolean {
  return SYSTEM_ROLE_NAMES.includes(name);
}

export function getSystemRoleDefinition(name: string) {
  return SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === name);
}
