# Web Vitals monitoring

Client-side **Core Web Vitals** tracking for frontend performance engineering.

## Metrics

| Metric | Budget | Notes |
|--------|--------|--------|
| **LCP** | &lt; 2.5s | Largest Contentful Paint |
| **INP** | &lt; 100ms | Interaction to Next Paint (replaces deprecated **FID**) |
| **CLS** | &lt; 0.1 | Cumulative Layout Shift |
| **FCP** | &lt; 1.8s | First Contentful Paint (informational) |
| **TTFB** | &lt; 800ms | Time to First Byte (informational) |

Budgets are defined in `src/utils/performance.ts` (`PERFORMANCE_BUDGETS`).

## Reporting

- **`reportWebVitals()`** — registered in `src/main.tsx` via [`web-vitals`](https://github.com/GoogleChrome/web-vitals).
- Each sample is sent to analytics: `analytics.track('web_vital', { name, value, rating, delta, id, budget_exceeded })`.
- Endpoint: `POST /api/v1/analytics/events` (override with `VITE_ANALYTICS_ENDPOINT`). Uses `navigator.sendBeacon` when available; failures are ignored.

## Alerts

- **Console:** `Poor {metric}` when `rating === 'poor'`.
- **Toast:** Sonner error when **budget exceeded** or **poor** (once per metric `id`).
- **Dashboard:** `/performance` — session history, budget cards, violations list.

## Dashboard

- Route: **`GET /performance`** (lazy chunk `src/pages/Performance.tsx`).
- Super-admin sidebar: **Web Vitals** (redirect from `/platform-health`).
- Redux: `webVitals` slice (`latest`, `history`, `violations`).

## Development

```bash
npm run frontend:dev
# Open /performance after navigating the app to populate samples
```

Unit tests: `src/utils/performance.unit.test.ts`.
