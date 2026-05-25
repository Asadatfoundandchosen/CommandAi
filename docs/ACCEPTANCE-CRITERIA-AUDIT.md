# Acceptance Criteria Audit

**Project:** 1CommandAI Command Center  
**Audit date:** 2026-05-22  
**Scope:** Security & auth stories (code + IaC evidence; live deploy not verified unless noted)

**Status legend**

| Status | Meaning |
|--------|---------|
| **Met** | Implemented with clear code path and/or automated test |
| **Partial** | Implemented but missing deploy proof, SLO benchmark, UI wiring, or env-specific gap |
| **Not met** | Missing or contradictory to acceptance criteria |

---

## Story 1: JWT Login & Tokens

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Login returns access + refresh tokens | Met | `POST /api/v1/auth/login` — `auth.controller.ts`, `auth.service.ts` |
| 2 | Access token expires in 15 min | Met | `ACCESS_TOKEN_TTL_SEC = 15 * 60` — `jwt.service.ts` |
| 3 | Refresh token expires in 7 days | Met | `REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60` — `jwt.service.ts` |
| 4 | Refresh endpoint returns new tokens | Met | `POST /api/v1/auth/refresh` |
| 5 | Invalid token returns 401 | Met | `jwt-auth.middleware.ts` |
| 6 | Token contains `org_id`, `role` | Met | Access JWT payload — `jwt.service.ts` |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 2: Refresh Token Rotation & Reuse Detection

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Used refresh token rejected | Met | Redis Lua consume — `refresh-token.store.ts` |
| 2 | New refresh token has new `jti` | Met | Rotation in `auth.service.ts` |
| 3 | Token reuse invalidates all tokens | Met | `revokeAllRefreshTokensForUser` on theft detection |
| 4 | Alert sent on reuse detection | Met | `TokenReuseAlertService` |
| 5 | Token operations logged | Met | `auth-token.logger.ts` |
| 6 | Concurrent refresh handled | Met | `REFRESH_CONCURRENT_PREFIX` + `auth-rotation.unit.test.ts` |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 3: Token Blacklist

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Blacklisted token rejected | Met | `token-blacklist.service.ts` + JWT middleware |
| 2 | Logout blacklists current token | Met | `auth.service.ts` logout path |
| 3 | Password change blacklists all tokens | Met | `user.service.ts` → `revokeAllUserTokensOnPasswordChange` |
| 4 | Blacklist expires with token | Met | Redis `EX` aligned to JWT `exp` |
| 5 | Blacklist check is fast (&lt; 5ms) | Met | `token-blacklist.acceptance.unit.test.ts`; optional Redis integration test |
| 6 | Admin can revoke user tokens | Met | `POST /api/v1/auth/revoke-all` (org_admin) |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 4: Password Hashing (Argon2id)

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Password hashed with Argon2id | Met | `password.service.ts` |
| 2 | Weak password rejected (score &lt; 3) | Met | zxcvbn threshold in validation |
| 3 | Feedback provided for weak passwords | Met | Error payload includes zxcvbn feedback |
| 4 | Password verify works | Met | `verifyPassword()` |
| 5 | Password not in any logs | Met | No plaintext password in log statements |
| 6 | Hash different each time (salt) | Met | Per-hash random salt |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 5: Account Lockout

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Account locked after 5 failures | Met | `lockout.service.ts` |
| 2 | Lockout duration increases | Met | Progressive lockout tiers |
| 3 | Successful login clears attempts | Met | `clearFailedAttempts` on success |
| 4 | Locked account cannot login | Met | Pre-auth lockout check |
| 5 | Lockout status returned in error | Met | HTTP 423 + `lockout_until` in body |
| 6 | Alert on repeated lockouts | Met | `LockoutAlertService` |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 6: Session Management

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Sessions tracked with device info | Met | `auth-session.service.ts` |
| 2 | List sessions shows all active | Met | `GET /api/v1/auth/sessions` |
| 3 | Revoke individual session works | Met | `DELETE /api/v1/auth/sessions/:id` |
| 4 | Revoke all sessions works | Met | `DELETE /api/v1/auth/sessions` |
| 5 | `last_active` updates | Met | Updated on authenticated activity |
| 6 | Session limit enforced | Met | `AUTH_SESSION_MAX_PER_USER` — `config/index.ts` |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 7: Secure Cookies & CSRF

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Cookies have HttpOnly flag | Met | `buildHttpOnlyCookieOptions()` — `auth-cookies.ts` |
| 2 | Cookies have Secure flag | Met | `config.cookies.secure` |
| 3 | Cookies have SameSite=strict | Met | Default `SESSION_COOKIE_SAMESITE=strict` — `.env.example` |
| 4 | CSRF token required for mutations | Met | `csrf.middleware.ts` + `X-CSRF-Token` double-submit |
| 5 | Cookies cleared on logout | Met | `clearAuthCookies()` |
| 6 | Cookie not accessible via JS | Partial | Refresh/session cookies are HttpOnly ✓; CSRF cookie is **intentionally readable** by same-origin JS for header mirroring — `buildCsrfCookieOptions()` sets `httpOnly: false` |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 8: TOTP MFA

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | TOTP setup returns QR code | Met | `mfa.service.ts` + speakeasy |
| 2 | QR code scans in Authenticator | Met | Standard `otpauth://` URI |
| 3 | Verify with valid code succeeds | Met | `verifyTotp()` |
| 4 | Invalid code rejected | Met | 401/400 on mismatch |
| 5 | 30s time drift allowed | Met | `TOTP_WINDOW = 1` (±1 step) |
| 6 | Backup codes generated | Met | `backup-codes.service.ts` on setup |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 9: SMS MFA

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | SMS sent successfully | Met | `sms-mfa.service.ts` (Twilio when configured) |
| 2 | Code is 6 digits | Met | Generation + validation |
| 3 | Code expires after 5 min | Met | Redis TTL |
| 4 | Valid code verifies | Met | Hashed compare in store |
| 5 | Rate limit enforced | Met | Per-phone/user rate limits |
| 6 | SMS logged for audit | Met | Audit / structured logging |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 10: Magic Link Authentication

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Magic link email sent | Met | `magic-link.service.ts` |
| 2 | Link contains secure token | Met | Random token; hash stored in Redis |
| 3 | Link expires after 15 min | Met | TTL constant |
| 4 | Valid link logs user in | Met | `POST /api/v1/auth/magic-link/consume` |
| 5 | Link is one-time use | Met | Token deleted on consume |
| 6 | Reused link rejected | Met | Missing/expired → 401 |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 11: MFA Backup Codes

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | 10 backup codes generated | Met | `BACKUP_CODE_COUNT` constant |
| 2 | Codes are secure random | Met | `crypto.randomBytes` |
| 3 | Code works for login | Met | MFA verify path |
| 4 | Used code cannot be reused | Met | Hash + mark consumed |
| 5 | Warning at 3 remaining | Met | Response when count ≤ 3 |
| 6 | Regenerate invalidates old codes | Met | Replace full set on regenerate |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 12: MFA Policy Enforcement

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | MFA policy saved | Met | `modules/mfa-policy/` |
| 2 | Grace period enforced | Met | `mfa-policy.logic.ts` |
| 3 | Access blocked after grace period | Met | `isEnforcementBlocking()` |
| 4 | Setup URL provided in error | Met | Enforcement middleware response body |
| 5 | Reminder emails sent | Met | BullMQ `mfa-policy-daily-reminder` + SendGrid |
| 6 | Admins-only option works | Met | `MfaRequiredFor: "admins"` — `mfa-policy.model.ts` |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 13: SAML SSO

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | SAML login redirects to IdP | Met | `saml.controller.ts` |
| 2 | Callback creates session | Met | ACS handler + JWT/cookies |
| 3 | User mapped correctly | Met | JIT + attribute mapping |
| 4 | Signed assertions validated | Met | `@node-saml/node-saml` |
| 5 | Logout works (SLO) | Met | `POST /api/v1/auth/saml/:orgId/logout` |
| 6 | Multiple IdPs per org supported | Partial | **Single SAML config per org** in org settings; no multi-IdP registry |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 14: OIDC SSO

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | OIDC login redirects to IdP | Met | `oidc.controller.ts` |
| 2 | Callback exchanges code for tokens | Met | `oidc.service.ts` |
| 3 | ID token validated | Met | JWKS / issuer validation |
| 4 | User created/updated from claims | Met | JIT provisioning service |
| 5 | PKCE challenge verified | Met | `oidc-pkce.store.ts` |
| 6 | Google/Microsoft tested | Partial | Provider templates exist; **no automated E2E** against live Google/Microsoft in CI |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 15: JIT SSO Provisioning

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | User created on first SSO login | Met | `sso-provisioning.service.ts` |
| 2 | Attributes mapped correctly | Met | Claim → field mapping |
| 3 | Default role assigned | Met | Configurable default role |
| 4 | Department resolved if mapped | Met | Hierarchy resolver |
| 5 | Existing user updated | Met | Upsert on subsequent logins |
| 6 | Provisioning logged | Met | Audit + structured logs |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 16: IdP Group → Role Mapping

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | IdP groups extracted from token | Met | SAML/OIDC group claim extraction |
| 2 | Groups mapped to roles | Met | `group-mapping.service.ts` |
| 3 | User role updated on login | Met | Applied in SSO callback |
| 4 | Role change logged | Met | Audit trail |
| 5 | No matching group = default role | Met | Fallback role when no match |
| 6 | Admin UI works | Partial | `src/components/GroupMappingAdmin.tsx` exists; **end-to-end UI ↔ API** needs manual QA |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 17: SSO Enforcement

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Password login blocked when enforced | Met | SSO enforcement middleware |
| 2 | SSO redirect shown on login | Met | Error payload with redirect URL |
| 3 | Emergency access works | Met | Time-boxed bypass token |
| 4 | Emergency access logged | Met | Audit entry |
| 5 | Emergency access expires | Met | TTL on bypass token |
| 6 | Admin can enable/disable enforcement | Met | Org settings API |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 18: SCIM Provisioning

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | SCIM user CRUD works | Met | `modules/scim/` — `app.use("/scim/v2", …)` |
| 2 | SCIM group CRUD works | Met | SCIM Groups endpoints |
| 3 | User deactivation works | Met | `active: false` |
| 4 | Filtering/pagination works | Met | SCIM query parameters |
| 5 | SCIM auth validated | Met | Bearer SCIM token middleware |
| 6 | Operations logged | Met | SCIM audit logging |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 19: Role Management

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | System roles seeded | Met | RBAC seed / migration |
| 2 | Custom roles can be created | Met | `modules/rbac/roles` |
| 3 | Permissions validated | Met | Zod + permission registry |
| 4 | System roles not deletable | Met | Service guard |
| 5 | Role hierarchy enforced | Met | `role-hierarchy` logic |
| 6 | Roles scoped to org | Met | `org_id` on all role queries |

**Story score:** 6 Met · 0 Partial · 0 Not met

---

## Story 20: Permission System

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Permission format validated | Met | `resource:action` registry |
| 2 | Wildcard matching works | Met | `permission-matcher.ts` |
| 3 | Scope inheritance works | Met | Account/dept scope rules |
| 4 | `hasPermission` is fast | Met | In-memory + Redis cache path |
| 5 | Unknown permissions rejected | Met | Registry validation |
| 6 | Permission matrix documented | Partial | Logic covered in code/tests; **standalone matrix doc** may be incomplete |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 21: Role Hierarchy & Inheritance

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Higher role has lower permissions | Met | Hierarchy ordering + tests |
| 2 | `org_admin` can do everything | Met | Wildcard / full-access path |
| 3 | `dept_user` most restricted | Met | Default role caps |
| 4 | Permissions cached | Met | `permission-cache.service.ts` |
| 5 | Cache invalidated on change | Met | Events + explicit invalidation |
| 6 | UI shows inherited permissions | Partial | Backend exposes effective permissions; **frontend inheritance display** not verified in this audit |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 22: Permission Cache (Redis)

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Permissions cached in Redis | Met | `permission-cache.service.ts` |
| 2 | Cache hit rate &gt; 90% | Partial | Prometheus `rbac_permission_cache_hits_total`; **no CI/load proof** of 90% |
| 3 | Auth check &lt; 5ms with cache | Partial | Fast path exists; **not benchmarked in CI** |
| 4 | Invalidation works | Met | Invalidation API + tests |
| 5 | TTL expires correctly | Met | Redis `EX` on cache keys |
| 6 | Metrics show cache performance | Met | `permission-cache.metrics.ts` on `GET /metrics` |

**Story score:** 4 Met · 2 Partial · 0 Not met

---

## Story 23: API Keys

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | API key generated | Met | `modules/api-keys/` |
| 2 | Key hash stored (not plain) | Met | SHA-256 of secret only |
| 3 | Key validates correctly | Met | `api-key-auth.middleware.ts` |
| 4 | Permissions enforced | Partial | Middleware checks scopes; **`createApiKeyAuthMiddleware` not mounted in `app.ts`** — protected routes use JWT only |
| 5 | Expired key rejected | Met | `expires_at` check |
| 6 | Revoked key rejected | Met | `revoked_at` check |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 24: Rate Limiting

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Tenant limit enforced | Met | Redis sliding window per tenant — `rate-limiter.middleware.ts` |
| 2 | User limit enforced | Met | Per-user keys |
| 3 | Endpoint limit enforced | Met | Per-route keys |
| 4 | 429 returned with Retry-After | Met | 429 + `X-RateLimit-*` headers |
| 5 | Sliding window accurate | Met | Lua ZSET script + unit tests |
| 6 | Limits configurable per org | Partial | **Global env** limits only; no `org_settings` override in middleware |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 25: Request Validation

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Invalid requests return 400 | Met | Zod/Joi on auth, RBAC, SCIM, credits, etc. |
| 2 | Error details are helpful | Met | Field paths in `details` |
| 3 | Unknown fields stripped | Partial | `.strict()` on some schemas; **not universal** across all routes |
| 4 | All endpoints have schemas | Partial | Major modules covered; **not every route** |
| 5 | OpenAPI shows validation rules | Partial | `swagger-jsdoc` on many routes; gaps remain |
| 6 | Nested validation works | Met | Zod nested objects on complex bodies |

**Story score:** 3 Met · 3 Partial · 0 Not met

---

## Story 26: Encryption at Rest

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | MongoDB encrypted at rest | Met | Terraform Atlas encryption / BYOK — `mongodb-atlas/encryption.tf` |
| 2 | Redis encrypted at rest | Partial | ElastiCache at-rest in AWS; **not customer CMK** in all environments |
| 3 | S3 encrypted with SSE-KMS | Met | `s3-files-bucket` Terraform module |
| 4 | PostgreSQL encrypted | Met | RDS `storage_encrypted` — `rds-timescale-postgres/encryption.tf` |
| 5 | Elasticsearch encrypted | Met | OpenSearch domain encryption — `opensearch-domain/encryption.tf` |
| 6 | Keys in AWS KMS | Partial | KMS modules + Atlas BYOK; requires **`terraform apply`** for live environments |

**Story score:** 4 Met · 2 Partial · 0 Not met

---

## Story 27: Encryption in Transit

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | API uses TLS 1.3 | Met | ALB policy `ELBSecurityPolicy-TLS13-1-2-2021-06` — `alb-api-https` |
| 2 | Database connections use TLS | Met | `config/tls-policy.ts`, `rediss://`, MongoDB TLS |
| 3 | Internal traffic uses mTLS | Partial | Istio STRICT mTLS manifests; **requires deployed mesh** |
| 4 | HSTS header present | Met | `https-security.middleware.ts` |
| 5 | SSL Labs rating A+ | Partial | **Not run in repo**; depends on live cert + ALB config |
| 6 | No plaintext traffic | Partial | Edge HTTPS ✓; ALB→pod may be HTTP; dev allows plaintext |

**Story score:** 3 Met · 3 Partial · 0 Not met

---

## Story 28: Field-Level Encryption

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Sensitive fields encrypted | Met | AES-256-GCM — `field-encryption.ts` + Mongoose plugin |
| 2 | Decryption works correctly | Met | Unit tests |
| 3 | IV is random per encryption | Met | 12-byte random IV |
| 4 | Auth tag prevents tampering | Met | GCM authentication tag |
| 5 | Encrypted data not readable in DB | Met | `v2:` base64 blobs in MongoDB |
| 6 | Mongoose plugin works | Partial | Plugin on User, Organization, Connector; **no full Mongo integration test** |

**Story score:** 5 Met · 1 Partial · 0 Not met

---

## Story 29: Key Management

| # | Acceptance criterion | Status | Evidence / notes |
|---|----------------------|--------|------------------|
| 1 | Keys stored in KMS/Vault | Partial | Terraform `kms-app-encryption` + Vault policies; app uses **`FIELD_ENCRYPTION_KEY` env**, not live KMS/Vault API |
| 2 | App can encrypt/decrypt | Met | `field-encryption.ts` |
| 3 | Key rotation enabled | Partial | AWS `enable_key_rotation`; Vault transit scripts; **field key rotation needs Mongo re-encrypt** |
| 4 | Access audited | Partial | IAM/Vault policy docs; **not full app-level audit trail** |
| 5 | Least privilege enforced | Partial | Separate app/admin IAM in Terraform |
| 6 | Rotation doesn't break existing data | Partial | Documented in `docs/runbooks/key-management.md`; **not automated** for field blobs |

**Story score:** 1 Met · 5 Partial · 0 Not met

---

## Overall summary

| Story | Met | Partial | Not met | Pass rate |
|-------|-----|---------|---------|-----------|
| 1 JWT Login & Tokens | 6 | 0 | 0 | 100% |
| 2 Refresh Rotation | 6 | 0 | 0 | 100% |
| 3 Token Blacklist | 6 | 0 | 0 | 100% |
| 4 Password Hashing | 6 | 0 | 0 | 100% |
| 5 Account Lockout | 6 | 0 | 0 | 100% |
| 6 Sessions | 6 | 0 | 0 | 100% |
| 7 Cookies & CSRF | 5 | 1 | 0 | 83% |
| 8 TOTP MFA | 6 | 0 | 0 | 100% |
| 9 SMS MFA | 6 | 0 | 0 | 100% |
| 10 Magic Link | 6 | 0 | 0 | 100% |
| 11 Backup Codes | 6 | 0 | 0 | 100% |
| 12 MFA Policy | 6 | 0 | 0 | 100% |
| 13 SAML SSO | 5 | 1 | 0 | 83% |
| 14 OIDC SSO | 5 | 1 | 0 | 83% |
| 15 JIT Provisioning | 6 | 0 | 0 | 100% |
| 16 Group Mapping | 5 | 1 | 0 | 83% |
| 17 SSO Enforcement | 6 | 0 | 0 | 100% |
| 18 SCIM | 6 | 0 | 0 | 100% |
| 19 Roles | 6 | 0 | 0 | 100% |
| 20 Permissions | 5 | 1 | 0 | 83% |
| 21 Role Hierarchy | 5 | 1 | 0 | 83% |
| 22 Permission Cache | 4 | 2 | 0 | 67% |
| 23 API Keys | 5 | 1 | 0 | 83% |
| 24 Rate Limiting | 5 | 1 | 0 | 83% |
| 25 Request Validation | 3 | 3 | 0 | 50% |
| 26 Encryption at Rest | 4 | 2 | 0 | 67% |
| 27 Encryption in Transit | 3 | 3 | 0 | 50% |
| 28 Field Encryption | 5 | 1 | 0 | 83% |
| 29 Key Management | 1 | 5 | 0 | 17% |
| **Total (174 criteria)** | **147** | **27** | **0** | **84% Met** |

---

## Recommended follow-ups (by impact)

| Priority | Story | Action |
|----------|-------|--------|
| P0 | 23 API Keys | Mount `createApiKeyAuthMiddleware` on M2M routes in `app.ts` |
| P0 | 29 Key Management | Wire Vault/KMS + re-encrypt migration before rotation |
| P1 | 24 Rate Limiting | Per-org limit overrides from `org_settings` |
| P1 | 22 Permission Cache | Load test / CI benchmark for &gt;90% hit rate and &lt;5ms |
| P1 | 25 Request Validation | `.strict()` + Zod on remaining routes; complete OpenAPI refs |
| P2 | 26–27 Encryption | `terraform apply` + SSL Labs scan on staging ALB |
| P2 | 13 SAML | Multi-IdP per org only if product requires it |
| P2 | 14 OIDC | Add E2E tests with mock IdP or test tenants |

---

*Generated from codebase audit. Re-run after significant auth/security changes.*
