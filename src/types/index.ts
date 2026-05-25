/** UI role scope (maps from JWT / RBAC for navigation). */
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ORG = 'org_admin',
  ACCOUNT = 'account_admin',
  DEPARTMENT = 'dept_user',
}

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  orgName: string;
  accountName?: string;
  departmentName?: string;
};

export type QueuedAction = {
  id: string;
  status: 'Pending' | 'Completed' | 'Failed';
  title: string;
};
