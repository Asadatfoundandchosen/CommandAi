/**
 * One-time (or per-new-collection) sharding for 1CommandAI tenant collections.
 *
 * Prerequisite: MongoDB Atlas SHARDED cluster, mongosh connected to the deployment.
 * Usage: mongosh "<SRV>" --file scripts/mongodb/shard-app-collections.mongosh.js
 *    or: load("scripts/mongodb/shard-app-collections.mongosh.js")
 */
const dbName = "app_db";

const collections = [
  "users",
  "accounts",
  "departments",
  "agents",
  "signals",
  "organizations",
];

print(`Enabling sharding on database: ${dbName}`);
try {
  const r = sh.enableSharding(dbName);
  printjson(r);
} catch (e) {
  print("enableSharding note:", e.message);
}

for (const coll of collections) {
  const ns = `${dbName}.${coll}`;
  try {
    print(`Sharding: ${ns} with { org_id: "hashed" }`);
    const out = sh.shardCollection(ns, { org_id: "hashed" });
    printjson(out);
  } catch (e) {
    print("shardCollection (may be already sharded or collection missing):", e.message);
  }
}

print("Done. In Atlas, open Metrics / Sharding for chunk distribution. Atlas manages balancer and shards.");
