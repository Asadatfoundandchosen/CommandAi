/** Canonical audit action names for tenant and platform admin operations. */
export const ADMIN_EVENTS = {
  ROLE_ASSIGNED: "admin.role.assigned",
  ROLE_REVOKED: "admin.role.revoked",
  ROLE_CREATED: "admin.role.created",
  ROLE_UPDATED: "admin.role.updated",
  ROLE_DELETED: "admin.role.deleted",
  ORG_SETTINGS_CHANGED: "admin.org.settings",
  ACCOUNT_CREATED: "admin.account.created",
  ACCOUNT_UPDATED: "admin.account.updated",
  DEPARTMENT_CREATED: "admin.department.created",
  DEPARTMENT_UPDATED: "admin.department.updated",
  SSO_CONFIGURED: "admin.sso.configured",
  BILLING_RATES_CHANGED: "admin.billing.rates",
  MFA_POLICY_CHANGED: "admin.mfa.policy",
  RETENTION_POLICY_CHANGED: "admin.retention.policy",
  API_KEY_CREATED: "admin.apikey.created",
  API_KEY_REVOKED: "admin.apikey.revoked",
  API_KEY_UPDATED: "admin.apikey.updated",
  API_KEY_ROTATED: "admin.apikey.rotated",
} as const;

export type AdminEventType = (typeof ADMIN_EVENTS)[keyof typeof ADMIN_EVENTS];

/** Actions that trigger immediate security alerts (`[ADMIN ALERT]`). */
export const CRITICAL_ADMIN_EVENTS = new Set<AdminEventType>([
  ADMIN_EVENTS.SSO_CONFIGURED,
  ADMIN_EVENTS.API_KEY_CREATED,
  ADMIN_EVENTS.API_KEY_REVOKED,
  ADMIN_EVENTS.API_KEY_ROTATED,
  ADMIN_EVENTS.ROLE_ASSIGNED,
  ADMIN_EVENTS.ORG_SETTINGS_CHANGED,
  ADMIN_EVENTS.BILLING_RATES_CHANGED,
  ADMIN_EVENTS.MFA_POLICY_CHANGED,
]);
