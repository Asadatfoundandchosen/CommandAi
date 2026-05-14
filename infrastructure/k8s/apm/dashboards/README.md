# Datadog dashboard templates

Datadog dashboard JSON is **account-specific** (layout IDs, scopes). Recommended approach:

1. Build the three dashboards in the UI (**Service overview**, **Error tracking**, **Latency breakdown**) using APM and Metrics widgets filtered on `service:platform-api` (or your `DD_SERVICE`) and `env:<env>`.
2. **Export** each dashboard (**⋮ → Export dashboard JSON**) and store the JSON in this folder under version control if you want Git-tracked definitions.
3. Alternatively, manage dashboards with the **Terraform Datadog provider** (`datadog_dashboard`, `datadog_dashboard_json`) so `service` / `env` are parameterized per workspace.

Widget hints are documented in the parent [`../README.md`](../README.md).
