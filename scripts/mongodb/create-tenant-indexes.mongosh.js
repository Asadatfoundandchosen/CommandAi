/**
 * Application indexes for tenant-scoped collections in app_db.
 * Idempotent: safe to re-run; createIndex no-ops if the same spec exists.
 *
 * Usage: mongosh "<SRV>" --file scripts/mongodb/create-tenant-indexes.mongosh.js
 *    or: load("scripts/mongodb/create-tenant-indexes.mongosh.js")
 */
const dbName = "app_db";
const d = db.getSiblingDB(dbName);

const collectionsWithBaseIndexes = [
  "users",
  "accounts",
  "departments",
  "agents",
  "signals",
  "organizations",
];

const baseIndexes = [
  { key: { org_id: 1, is_deleted: 1 } },
  { key: { org_id: 1, created_at: -1 } },
  { key: { org_id: 1, updated_at: -1 } },
];

print(`Creating base indexes on ${collectionsWithBaseIndexes.length} collections in ${dbName}...`);
for (const name of collectionsWithBaseIndexes) {
  const coll = d.getCollection(name);
  for (const { key } of baseIndexes) {
    const r = coll.createIndex(key);
    print(`${name} ${JSON.stringify(key)} -> ${r}`);
  }
}

print("Collection-specific indexes...");

const users = d.getCollection("users");
printjson(
  users.createIndex(
    { org_id: 1, email: 1 },
    { unique: true, name: "org_id_1_email_1_unique" },
  ),
);

const agents = d.getCollection("agents");
printjson(
  agents.createIndex(
    { org_id: 1, account_id: 1, status: 1 },
    { name: "org_id_1_account_id_1_status_1" },
  ),
);

const signals = d.getCollection("signals");
printjson(
  signals.createIndex(
    { org_id: 1, agent_id: 1, created_at: -1 },
    { name: "org_id_1_agent_id_1_created_at_-1" },
  ),
);

print("Done. Run explain() on representative queries; see docs/DATABASE.md.");
