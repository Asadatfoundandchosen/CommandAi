# OpenSearch index lifecycle & retention

## Product summary

- **Hot** phase **7 days** (ingest / active search; first transition to **warm** at **7d** index age).
- **Warm** phase: **force merge** on entry (`max_num_segments: 1`); **shrink** to **1** primary shard when applicable. *Product language “warm 30 days”* describes a typical **warm-storage** window; the **implemented** ISM policy keeps indices in the **warm** *state* from **7d** until **deletion** at **90d** (or tune transitions—see below).
- **Delete** at **90d** index age (from creation).

## Amazon OpenSearch: **ISM** (not Elasticsearch ILM)

On **AWS OpenSearch Service**, use **Index State Management (ISM)**. Elasticsearch **ILM** JSON (rollover / phase names) does **not** apply directly. A reference ILM shape for **self-hosted Elasticsearch** is in:

- `infrastructure/opensearch/reference/elasticsearch-ilm-operator-example.json`

## Policy file (OpenSearch ISM)

- **File:** `infrastructure/opensearch/ism/1commandai-lifecycle-policy.json`
- **Applies to index patterns:** `audit-*`, `search-*` (via `ism_template` in the policy).

### Apply to the domain

```http
PUT https://<endpoint>/_plugins/_ism/policies/1commandai-lifecycle
```

Send the **body** as the full JSON file contents (the object whose top key is `policy`).

New indices matching `audit-*` and `search-*` pick up the policy **if** the template is attached (ISM applies by pattern). For existing indices, add the policy (see “Add policy to index” in OpenSearch docs) or reindex.

### Rollover (50 GB / 7d) — optional

The **operator** ILM example includes **rollover** in the **hot** phase. **Monthly** indices like `audit-2026.04` are **not** always behind a rollover **alias**; the committed ISM policy uses **age-based** transitions only. If you use a **write alias** and `audit-000001`-style names, add a **rollover** action to the **hot** state and set `index.plugins.index_state_management.rollover_alias` on the index. See [ISM rollover](https://docs.opensearch.org/latest/im-plugin/ism/policies/#rollover).

### Shrink on single-shard indices

Index templates set **`number_of_shards: 1`**. **Shrink** to one shard may **no-op** or **fail** on some versions; if ISM errors on **shrink**, remove the **shrink** action from the **warm** state and rely on **force_merge** only.

### UltraWarm (AWS)

Moving shards to **UltraWarm** nodes is a separate **allocation** action (node attributes). Only enable if the domain has a **warm** tier. Not included in the default policy to avoid allocation failures on **hot-only** domains.

## Monitor ISM status

| Action | API / location |
|--------|----------------|
| Explain index | `GET _plugins/_ism/explain/<index-name>` |
| List policies | `GET _plugins/_ism/policies` |
| Managed index status | OpenSearch **Dashboards** → **Index Management** → **Managed indices** |
| CloudWatch | OpenSearch domain metrics: `ClusterIndexWritesBlocked`, `CPUUtilization`, `JVMMemoryPressure`, `FreeStorageSpace` |

**Healthy:** `explain` shows `policy_id`, current `state` (`hot` / `warm` / `delete`), and no repeated `failed` actions.

## Retention table (operational)

| Milestone (index age) | State / action |
|------------------------|----------------|
| 0–7d | **hot** (write/search) |
| 7d+ | Enter **warm**; **force_merge** (and **shrink** if configured) |
| 90d+ | **delete** index |

Adjust **`min_index_age`** strings in the policy JSON if compliance requires a different **delete** point.

## Terraform

There is no first-class **ISM policy** resource in the default AWS provider; policies are usually applied with **OpenSearch API** (`curl` / CI) or a **null_resource** `local-exec` after the domain is created. Store the policy JSON in this repo and apply in the **post-deploy** step.
