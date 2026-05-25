# Code splitting (route-based lazy loading)

The SPA uses **React.lazy** + **Suspense** so the initial bundle stays small; feature pages load on demand.

## Routes (lazy chunks)

| Path | Chunk | Page module |
|------|-------|-------------|
| `/login` | `Login` | `src/pages/Login.tsx` |
| `/dashboard` | `Dashboard` | `src/pages/Dashboard.tsx` |
| `/agents/*` | `Agents` | `src/pages/Agents.tsx` |
| `/signals/*` | `Signals` | `src/pages/Signals.tsx` |
| `/settings/*` | `Settings` | `src/pages/Settings.tsx` |

Legacy paths redirect (e.g. `/usage` → `/dashboard`, `/agent-registry` → `/agents`).

## Suspense boundaries

1. **Root** — `App.tsx` wraps `<Routes>` with `<Suspense fallback={<LoadingSpinner fullPage />}>`.
2. **Authenticated shell** — `AppShellRoute` adds `PageSuspense` per route.
3. **Nested** — `Agents` / `Signals` lazy-load heavy widgets; `Settings` lazy-loads MFA/retention panels.

## Loading UI

`src/components/layout/LoadingSpinner.tsx` — spinner + optional label; use `fullPage` at root.

## Prefetch on hover

`src/routes/lazy-pages.ts` — `prefetchRouteForPath(path)` called from **Sidebar** `onMouseEnter` / `onFocus` to warm chunks before navigation.

## Bundle analysis

```bash
npm run frontend:analyze
```

Builds the app and writes **`dist-web/stats.html`** (rollup-plugin-visualizer). Open in a browser to inspect chunk sizes (gzip/brotli).

## Manual chunks (Vite)

`vite.config.ts` also splits **vendor** (react) and **redux** for stable caching.
