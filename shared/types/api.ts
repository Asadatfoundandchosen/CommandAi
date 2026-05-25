/**
 * Shared API contract types — source of truth for Lovable (frontend) and Cursor (backend).
 * Align with OpenAPI (`shared/openapi/openapi.json`) and Mongoose models in `backend/src/modules/`.
 */

/** Tenant RBAC roles returned on user resources (JWT claim + API). */
export type TenantRole = 'org_admin' | 'account_admin' | 'dept_manager' | 'dept_user';

export interface User {
  id: string;
  org_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: TenantRole;
}

export type AgentStatus = 'active' | 'paused' | 'draft';

export interface Agent {
  id: string;
  org_id: string;
  account_id: string;
  name: string;
  status: AgentStatus;
}
