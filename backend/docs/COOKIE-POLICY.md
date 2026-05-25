# Cookie policy (1CommandAI API)

## Overview

Browser clients use **httpOnly** cookies for refresh tokens and **double-submit CSRF** tokens. Access tokens remain in memory (Bearer header) with a **15-minute** lifetime.

## Cookies

| Name | HttpOnly | Secure | SameSite | Max-Age | Purpose |
|------|----------|--------|----------|---------|---------|
| `1cmd_session` | Yes | Config | Config | 24h | express-session store id |
| `refresh_token` | Yes | Config | Config | 7d | JWT refresh token (rotation) |
| `1cmd_csrf` | No | Config | Config | 7d | CSRF double-submit value |

### Flags

- **HttpOnly** — JavaScript cannot read `refresh_token` or `1cmd_session` (mitigates XSS token theft).
- **Secure** — Cookies are sent only over HTTPS when `SESSION_COOKIE_SECURE=true` (required in staging/production).
- **SameSite=strict** — Cookies are not sent on cross-site requests (mitigates CSRF). Use `lax` only for local tooling if needed.

### Domain and path

- **Path**: `/` (all API routes on the host).
- **Domain**: optional `COOKIE_DOMAIN` (e.g. `.1command.ai` for subdomains). Unset = host-only.

## CSRF protection

State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) that include auth cookies must send:

```
X-CSRF-Token: <same value as 1cmd_csrf cookie>
```

The server compares the header to the cookie (**double-submit**). Bearer-only clients (no auth cookies) are exempt.

**Exempt paths** (no CSRF validation): `POST /api/v1/auth/login`, Stripe webhook.

On **login** and **refresh**, the API sets:

- `Set-Cookie: 1cmd_csrf=…`
- `X-CSRF-Token: …` response header

SPAs should copy the header value (or read the cookie) and send it on subsequent mutations with `credentials: 'include'`.

## Logout

`POST /api/v1/auth/logout` and `DELETE /api/v1/auth/sessions` clear `refresh_token` and `1cmd_csrf`.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_COOKIE_SECURE` | `false` (dev) | Set `true` in staging/prod (HTTPS) |
| `SESSION_COOKIE_SAMESITE` | `strict` | `strict` \| `lax` \| `none` |
| `COOKIE_DOMAIN` | (empty) | Optional cookie domain |
| `AUTH_REFRESH_IN_COOKIE` | `true` | Set httpOnly refresh cookie |
| `AUTH_REFRESH_IN_RESPONSE_BODY` | `true` | Include refresh in JSON (legacy) |
| `CSRF_PROTECTION_ENABLED` | `true` | Enforce CSRF when cookies present |

## Client integration

```javascript
// fetch example (same-origin or CORS with credentials)
await fetch("/api/v1/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});

// Store access token in memory; refresh stays in httpOnly cookie.
// On mutations, echo CSRF from login response header:
await fetch("/api/v1/users", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-CSRF-Token": csrfTokenFromLogin,
  },
  body: JSON.stringify(payload),
});
```

## References

- `backend/src/common/cookies/auth-cookies.ts`
- `backend/src/common/middleware/csrf.middleware.ts`
- `backend/src/common/middleware/session.middleware.ts`
