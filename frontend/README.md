# Frontend (Lovable prototype)

In the **`1commandai/platform`** monorepo, the Lovable export lives here:

```text
frontend/          ← Lovable / GitHub sync (UI components, pages, assets)
backend/           ← Cursor-built Express API
shared/            ← API types + OpenAPI contract
```

## This workspace

During migration, UI code may still live at the repo root under **`src/`** (Vite entry `src/main.tsx`). Treat **`src/components/`** as the Lovable-aligned surface until the export is moved under **`frontend/`**.

## Sync from Lovable

1. Export or push from [Lovable](https://lovable.dev) to **`github.com/1commandai/frontend`** (or platform `frontend/`).
2. Copy or merge into `frontend/src` (or root `src/`).
3. Run `npm run frontend:build` and align API calls with **`shared/types`** + **`shared/openapi/openapi.json`**.

See **`docs/CURSOR-INTEGRATION.md`** and **`docs/API-CONTRACT.md`**.
