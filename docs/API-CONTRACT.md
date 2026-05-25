# API contract (frontend ↔ backend)

Contract between the **Lovable prototype** (UI) and the **Cursor-built API** in **`1commandai/platform`**.

## Repositories and layout

| Path | Owner | Purpose |
|------|--------|---------|
| `github.com/1commandai/platform` | Monorepo | Production layout |
| `frontend/` | Lovable export | React UI, components, pages |
| `backend/` | Cursor | Express modules, OpenAPI JSDoc |
| `shared/types/` | Both | TypeScript domain contracts |
| `shared/openapi/` | Both | Generated OpenAPI JSON |

This clone may use root **`src/`** for the UI until `frontend/` is populated.

## Shared TypeScript types

**Source of truth:** `shared/types/api.ts`

```ts
import type { User, Agent, TenantRole } from '@shared/types/api';
```

| Type | Fields | Notes |
|------|--------|--------|
| **User** | `id`, `org_id`, `email`, `first_name`, `last_name`, `role` | `role` is tenant RBAC (`TenantRole`) |
| **Agent** | `id`, `org_id`, `account_id`, `name`, `status` | `status`: `active` \| `paused` \| `draft` |

Backend persistence adds fields (e.g. `department_id`, `password_hash`) — see `backend/src/modules/user/user.model.ts`. API responses must not expose secrets; map Mongoose docs → shared shapes in controllers.

Frontend navigation may use a broader `UserRole` enum in `src/types/index.ts` for shell UX; **API payloads** should use `TenantRole` from shared types.

## OpenAPI

| Resource | Location |
|----------|----------|
| Live spec | `GET /api/docs/json` (running API) |
| Committed export | `shared/openapi/openapi.json` |
| Swagger UI | `GET /api/docs` |
| Backend generated types | `backend/src/types/openapi.generated.ts` |
| Frontend generated types | `src/types/openapi.generated.ts` (after `npm run openapi:types`) |

Regenerate after route changes:

```bash
npm run openapi:export   # writes shared/openapi/openapi.json
npm run openapi:types    # backend + frontend openapi-typescript
```

Authoritative JSDoc: `@openapi` blocks in `backend/src/modules/**/*.routes.ts` and controllers.

## Multi-tenant rules

1. **`org_id` from JWT** — never trust `org_id` from an unauthenticated body on tenant routes.
2. Queries include `{ org_id: tenantId, is_deleted: false }`.
3. Validate inputs with Zod (`*.validation.ts`) and document in OpenAPI.

## UI → API mapping (build APIs from screens)

When implementing endpoints, read the Lovable-aligned component first:

| UI area | Components | Typical API |
|---------|------------|-------------|
| Login / MFA | `LoginPage.tsx`, `MfaPolicyAdmin.tsx` | `POST /api/v1/auth/login`, org MFA policy |
| Org hierarchy | `RoleHierarchyAdmin.tsx`, Sidebar | `GET /api/v1/organization/hierarchy`, roles |
| Usage / credits | `UsageDashboard.tsx`, `CreditRateCard.tsx` | `GET /api/v1/usage/summary`, credits |
| Audit | `RetentionPolicyAdmin.tsx` | `GET/PUT /api/v1/organization/retention-policy` |
| Agents (planned) | Agent registry nav | `GET/POST /api/v1/agents` — shape **`Agent`** in shared types |

## Versioning

- OpenAPI `info.version` tracks the API bundle.
- Breaking changes: bump version, update shared types, regenerate clients, note in PR description.
