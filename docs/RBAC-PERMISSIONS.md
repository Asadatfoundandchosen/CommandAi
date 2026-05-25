# RBAC permissions (`resource:action:scope`)

1CommandAI access control uses granular permission strings in **`resource:action:scope`** format.

## Format

```
<resource>:<action>:<scope>
```

| Part | Examples | Wildcard |
|------|----------|----------|
| **resource** | `agents`, `signals`, `users` | `*` |
| **action** | `create`, `read`, `update`, `delete`, `manage` | `*` |
| **scope** | `own`, `department`, `account`, `organization` | `*` |

### Examples

| Permission | Meaning |
|------------|---------|
| `agents:create:account` | Create agents within the user's account |
| `signals:read:own` | Read only the user's own signals |
| `users:manage:organization` | Full user admin at org scope |
| `*:*:*` | Platform superuser (all resources) |

## Resources

`organizations`, `accounts`, `departments`, `users`, `agents`, `signals`, `approvals`, `playbooks`, `credits`, `contracts`, `audit`

## Actions

`create`, `read`, `update`, `delete`, `manage`, `*`

## Scopes (breadth)

Narrow → broad: **`own`** < **`department`** < **`account`** < **`organization`** < **`*`**

A grant at a **broader** scope satisfies checks at a **narrower** scope (e.g. `signals:read:department` allows `signals:read:own`).

## Wildcards

- `agents:*:account` — all actions on agents at account scope
- `accounts:*:organization` — all actions on accounts at org scope
- `*:*:*` — full access

## Role hierarchy (automatic inheritance)

**`org_admin` > `account_admin` > `dept_manager` > `dept_user`**

Higher roles automatically inherit all permissions from lower roles:

| Role | Also inherits permissions from |
|------|--------------------------------|
| `org_admin` | `account_admin`, `dept_manager`, `dept_user` |
| `account_admin` | `dept_manager`, `dept_user` |
| `dept_manager` | `dept_user` |
| `dept_user` | (none) |

`PermissionCacheService.getPermissions(userId)` loads from Redis (`permissions:{userId}`, TTL **5 minutes**). On miss, `PermissionResolverService` merges grants from `Role` documents (and `ROLE_HIERARCHY`). Cache is **invalidated** when the user role changes (user update, SSO group sync) or when role permissions change (`invalidateForRole`).

**Metrics** (Prometheus): `rbac_permission_cache_hits_total`, `rbac_permission_cache_misses_total`, `rbac_permission_cache_invalidations_total`.

**API:** `GET /api/v1/roles/hierarchy` — chain, inheritance map, effective permission counts.

**UI:** `RoleHierarchyAdmin` at `/settings/security/role-hierarchy`.

## Permission inheritance (scopes)

1. **Scope breadth** — enforced in `hasPermission()` via `scopeIncludes()`.
2. **System roles** — fixed grants per `SYSTEM_ROLE_DEFINITIONS` (seeded on API startup).
3. **Custom roles** — grants must be a subset of the **ceiling** system role for their `hierarchy_level` (e.g. level `4` → `dept_user` ceiling).

## System roles (seeded)

| Role | Level | Grants (summary) |
|------|-------|------------------|
| `platform_admin` | 0 | `*:*:*` |
| `org_admin` | 1 | Org-wide `*` on accounts, users, agents, signals, … |
| `account_admin` | 2 | Account-scoped management |
| `dept_manager` | 3 | Department + agents |
| `dept_user` | 4 | `signals:read:own`, `approvals:read:own` |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/roles/permissions` | Schema + assignable catalog |
| GET | `/api/v1/roles/hierarchy` | Role chain + inheritance documentation |
| GET | `/api/v1/roles/permission-matrix` | Matrix payload for UI |
| GET/POST/PATCH/DELETE | `/api/v1/roles` | Role CRUD (org_admin) |

## Middleware

```typescript
import {
  createLoadUserPermissionsMiddleware,
  createRequirePermission,
} from "@common/middleware";

// After JWT + tenant middleware
app.use("/api/v1/example", createLoadUserPermissionsMiddleware(container));

// On a route
router.post("/", createRequirePermission("agents:create:account"), handler);
```

Returns **403** `permission_denied` when the JWT role's effective grants do not satisfy the required permission.

## Legacy shorthand

Older two-part strings are normalized on read/validate:

| Legacy | Normalized |
|--------|------------|
| `*` | `*:*:*` |
| `signals:read` | `signals:read:own` |
| `approvals:own` | `approvals:read:own` |

## UI

`src/components/PermissionMatrix.tsx` — org admin matrix at `/settings/security/permission-matrix` (loads `GET /api/v1/roles/permission-matrix`).
