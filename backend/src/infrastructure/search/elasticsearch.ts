/**
 * **OpenSearch** 2.x client (Elasticsearch **8.x**–compatible HTTP API) for **audit log** search / analytics.
 * Credentials from **Vault** at deploy time (`OPENSEARCH_*` env vars).
 * Indexing: **`modules/audit/audit.service.ts`**, **`modules/search/search.service.ts`**. **Audit** uses monthly **`audit-YYYY.MM`**, create-only; **unified app search** uses **`search-v1`** (template **`search-*`**) in `infrastructure/opensearch/search-index-template.json`.
 */
import { Client } from "@opensearch-project/opensearch";

export type OpenSearchConnectionConfig = {
  /** HTTPS endpoint, e.g. `https://vpc-xxx.us-east-1.es.amazonaws.com` */
  node: string;
  username?: string;
  password?: string;
};

/** Composable index template & searches use this wildcard (see `infrastructure/opensearch/audit-index-template.json`). */
export const AUDIT_INDEX_PATTERN = "audit-*";

/** Unified full-text index for **agents, signals, users** (see `infrastructure/opensearch/search-index-template.json`). */
export const APP_SEARCH_INDEX_NAME = "search-v1";

export const APP_SEARCH_INDEX_PATTERN = "search-*";

let client: Client | null = null;

function normalizeNode(node: string): string {
  const t = node.trim();
  if (t.startsWith("http://")) {
    return t;
  }
  if (t.startsWith("https://")) {
    return t;
  }
  return `https://${t}`;
}

export function isOpenSearchConnected(): boolean {
  return client !== null;
}

/**
 * Opens a singleton **OpenSearch** client (optional — only when `OPENSEARCH_NODE` is set).
 */
export async function connectOpenSearch(
  cfg: OpenSearchConnectionConfig,
): Promise<Client> {
  if (client) {
    return client;
  }
  const node = normalizeNode(cfg.node);
  const auth =
    cfg.username !== undefined &&
    cfg.username.length > 0 &&
    cfg.password !== undefined &&
    cfg.password.length > 0
      ? { username: cfg.username, password: cfg.password }
      : undefined;
  const next = new Client({
    node,
    ...(auth ? { auth } : {}),
    ssl: { rejectUnauthorized: true },
  });
  await next.info();
  client = next;
  process.stdout.write("[opensearch] client connected\n");
  return next;
}

export function getOpenSearchClient(): Client | null {
  return client;
}

export async function closeOpenSearch(): Promise<void> {
  if (!client) {
    return;
  }
  const c = client;
  client = null;
  await c.close();
  process.stdout.write("[opensearch] client closed\n");
}

export function requireOpenSearchClient(): Client {
  const c = client;
  if (!c) {
    throw new Error("OpenSearch is not configured (set OPENSEARCH_NODE)");
  }
  return c;
}

/**
 * Monthly physical index name: **`audit-YYYY.MM`** (align with **ISM** / retention in `docs/OPENSEARCH.md`).
 */
export function auditIndexName(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `audit-${y}.${m}`;
}
