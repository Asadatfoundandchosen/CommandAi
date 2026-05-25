# Frontend (React 18 + TypeScript + Vite)

The UI is built with **React 18**, **TypeScript strict**, **Vite**, **Tailwind CSS**, and **Shadcn/UI**. Feature screens live under `src/components/` (synced from the Lovable prototype at [github.com/1commandai/frontend](https://github.com/1commandai/frontend), branch `main`). Platform monorepo layout: **`frontend/`** + **`backend/`** + **`shared/`** on [github.com/1commandai/platform](https://github.com/1commandai/platform) — see **`docs/CURSOR-INTEGRATION.md`** and **`docs/API-CONTRACT.md`**. See **`docs/COMPONENT-LIBRARY.md`** for usage.

## Tooling

| Tool | Config |
|------|--------|
| TypeScript | `tsconfig.json` (references), `tsconfig.app.json` (UI, strict) |
| Bundler | `vite.config.ts` — React plugin, `@` → `src/`, vendor/redux chunks, lazy routes, sourcemaps |
| Code splitting | `src/pages/*`, `src/routes/lazy-pages.ts`, Suspense — **`docs/CODE-SPLITTING.md`** |
| Styling | `tailwind.config.js` — `darkMode: 'class'`, brand colors, `@tailwindcss/forms` + `typography` |
| UI kit | Shadcn/UI — `components.json`, primitives in `src/components/ui/` |
| Lint | `eslint.config.mjs` — TypeScript ESLint + React Hooks |
| Format | `.prettierrc.json` |

## Scripts

```bash
npm run frontend:dev      # Vite dev server (http://localhost:5173)
npm run frontend:build    # Typecheck + production bundle → dist-web/
npm run frontend:analyze  # Build + dist-web/stats.html bundle report
npm run frontend:preview  # Preview production build
```

## Backend integration

During development, Vite proxies **`/api`** to the Express API (`VITE_API_PROXY_TARGET`, default `http://localhost:3000`). Run the API with:

```bash
npm run backend:dev
```

Cookies and CSRF from the backend work when the browser uses the Vite origin and the proxy forwards API calls.

**WebSocket:** Vite also proxies **`/socket.io`** to the API. See **`docs/REALTIME.md`** for `socketService`, `useSocket`, and event types (`signals`, `approvals`, `notifications`).

**Notifications:** **`NotificationProvider`** (toast + sound + browser + Redux), **`NotificationCenter`** dropdown (mark read, preferences). See **`docs/NOTIFICATIONS.md`**.

**Web Vitals:** **`reportWebVitals()`** in `main.tsx`; budgets and alerts in **`src/utils/performance.ts`**; dashboard **`/performance`**. See **`docs/WEB-VITALS.md`**.

## Layout

- `index.html` — Vite entry
- `src/main.tsx` — React 18 `createRoot`
- `src/App.tsx` — `react-router-dom` routes
- `src/components/ui/` — Shadcn primitives (Button, Input, Card, Dialog, Dropdown, Table, Tabs, Form, Toaster)
- `src/components/forms/` — form helpers (`TextFormField`)
- `src/components/layout/` — `AppShell`, `PageHeader`, `ThemeProvider`, dark mode toggle
- `src/components/data-display/` — `DataTable`, `StatCard`
- `src/components/*.tsx` — feature UIs (dashboards, admin panels, login)
- `src/store/` — Redux Toolkit (`index.ts`, `api.ts`, `hooks.ts`, `Provider.tsx`)
  - `slices/` — `authSlice` (token + user), `uiSlice` (sidebar, loading, action queue)
  - `endpoints/` — RTK Query modules: `authApi`, `usersApi`, `accountsApi`, `departmentsApi`, `agentsApi`, `signalsApi`
- `src/types/` — shared frontend types

## State management (Redux Toolkit)

- **RTK Query** — shared `api` slice; `baseUrl` `/api` with `credentials: 'include'`; JWT via `prepareHeaders` from `auth.token`
- **Tag types** — `User`, `Agent`, `Signal`, `Account`, `Department` for cache invalidation
- **Slices** — local UI/auth state not owned by the server
- **DevTools** — enabled when `import.meta.env.DEV`

```tsx
import { useAppSelector } from '@/store/hooks';
import { useListAccountsQuery } from '@/store/endpoints';
import { useLoginMutation } from '@/store/endpoints/authApi';
```

Legacy Node telemetry/API code remains in `src/main.ts`, `src/lib/`, etc., under `tsconfig.node.json` (not bundled by Vite).
