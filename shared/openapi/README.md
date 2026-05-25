# Shared OpenAPI spec

Canonical contract between **frontend** (Lovable) and **backend** (Cursor).

| Artifact | Path |
|----------|------|
| OpenAPI JSON | `openapi.json` (generated) |
| Backend Swagger UI | `GET /api/docs` when API is running |
| Backend codegen | `backend/src/types/openapi.generated.ts` |
| Frontend codegen | `src/types/openapi.generated.ts` (optional) |

## Regenerate

```bash
# From repo root (requires backend deps installed)
npm run openapi:export
npm run openapi:types
```

`openapi:export` runs `backend/scripts/dump-openapi.ts` and writes this folder plus `backend/openapi.json`.
