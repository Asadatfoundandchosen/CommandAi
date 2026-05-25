# Request validation

Incoming API requests are validated **before** controllers run. Invalid input returns **400** with a consistent error shape.

## Middleware

`backend/src/common/middleware/validation.middleware.ts`

| Helper | Schema |
|--------|--------|
| `validate(schema)` / `validateBody` | Joi object |
| `validateQuery` / `validateParams` | Joi object |
| `validateZodBody` / `validateZodQuery` / `validateZodParams` | Zod schema |

Options: `abortEarly: false` (all errors), `stripUnknown: true` (body/query/params).

## Error response

```json
{
  "error": "Validation Error",
  "details": [
    { "field": "email", "message": "\"email\" must be a valid email" }
  ]
}
```

OpenAPI: `#/components/responses/ValidationError` in `backend/src/common/validation/validation.openapi.ts`.

## Module schemas

Per-feature files: `backend/src/modules/{feature}/{feature}.validation.ts`

- **Joi** — e.g. `createUserSchema` in `user.validation.ts`
- **Zod** — most modules (auth, account, rbac, credits, …)

Apply validators on **route definitions**, not only inside controllers.

## Rules

1. Never trust `org_id` from body for tenant scope — use JWT / `tenantMiddleware`.
2. Document request bodies in route `@openapi` JSDoc; mirror rules in Joi/Zod.
3. Path/query ObjectIds: 24-char hex.

## JSON Schema

OpenAPI documents JSON Schema-shaped request bodies. Runtime validation uses **Joi** and **Zod** (same constraints).
