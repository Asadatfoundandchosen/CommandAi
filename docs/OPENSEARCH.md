# Amazon OpenSearch Service (Elasticsearch 8.x–compatible API)

## Role

- **Search and analyze** **audit events** (structured JSON) from the API using **`@opensearch-project/opensearch`** and **`modules/audit/AuditService`**.
- **Terraform** provisions a **VPC-only** domain: **OpenSearch 2.x**, **3** hot **data** nodes (`r6g.large.search`), **500 GiB gp3** per node, **dedicated masters**, **encryption at rest** + **node-to-node** + **HTTPS** (TLS 1.2+).
- **Optional UltraWarm** (2 warm nodes, HDD tier) via `warm_enabled` on the module.
- **Audit indices**: **one index per month** with name **`audit-YYYY.MM`**. **Structured mapping** is defined in **`infrastructure/opensearch/audit-index-template.json`**. **Immutable after write**: the API only **indexes** with `op_type: create` (append-only; no in-place updates). Retention: **ISM** (Index State Management) on `audit-*` (configure in OpenSearch Dashboards or API).

## Terraform

- Module: **`infrastructure/terraform/modules/opensearch-domain/`**
- Example stack: **`infrastructure/terraform/environments/opensearch/`**

After apply, copy **`master_user_password`** (when internal user DB is enabled) and endpoint into **Vault**; inject **`OPENSEARCH_NODE`**, **`OPENSEARCH_USERNAME`**, **`OPENSEARCH_PASSWORD`** into the API workload.

## Application env

| Variable | Description |
|----------|-------------|
| `OPENSEARCH_NODE` | VPC endpoint host or full `https://` URL (no trailing path). |
| `OPENSEARCH_USERNAME` | Fine-grained master user (optional if using IAM SigV4-only — then extend `elasticsearch.ts`). |
| `OPENSEARCH_PASSWORD` | From Vault. |

Wiring: **`backend/src/infrastructure/search/elasticsearch.ts`** (connect / client); **`backend/src/modules/audit/audit.service.ts`** — **`indexAuditEvent`**, **`searchAuditEvents`**.

## Composable index template (required)

Apply once per domain (e.g. DevTools or `curl` to `https://<endpoint>/_index_template/audit-events`):

- Source JSON: **`infrastructure/opensearch/audit-index-template.json`**

It targets **`audit-*`**, with **`timestamp`**, **`org_id`**, **`user_id`**, **`action`**, **`resource`**, **`resource_id`**, **`changes`** (stored, not indexed), **`ip_address`**, **`user_agent`**.

## Index lifecycle (ISM) & retention

- **Document:** **`docs/OPENSEARCH-RETENTION.md`**
- **OpenSearch ISM policy (apply to `audit-*` and `search-*`):** **`infrastructure/opensearch/ism/1commandai-lifecycle-policy.json`**
- **Elasticsearch ILM (reference only, self-hosted ES):** **`infrastructure/opensearch/reference/elasticsearch-ilm-operator-example.json`**

## App full-text search (`search-v1`)

- **Template**: **`infrastructure/opensearch/search-index-template.json`** — pattern **`search-*`**, **edge_ngram** **autocomplete** analyzer, **`title` / `content`** with **`.autocomplete`** subfields, **tenant** **`org_id`**, **`entity_type`** (`agent` | `signal` | `user`).
- **Service**: **`backend/src/modules/search/search.service.ts`** — `search(orgId, query, filters)` with **highlights**; always **filters** by `org_id`.
- **API**: **`GET /api/search?q=...`** with **`x-org-id`** or **`org_id`** query; optional **`entity_type`** (repeat or comma-separated).
- **Indexing**: `SearchService.indexAgent` / `indexSignal` / `indexUser`; **`AgentService.indexAgentForSearch`**, **`SignalService.indexSignalForSearch`**, **`UserService.syncUserToSearch`**.

## Related

- **`backend/src/server.ts`** — connects when `config.opensearch` is set; closes on shutdown after HTTP drain.
- **Immutability**: `AuditService` does not expose **update**; all writes use **`op_type: create`**.
