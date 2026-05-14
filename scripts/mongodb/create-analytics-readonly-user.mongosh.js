/**
 * Read-only DB user for **MONGODB_ANALYTICS_URI** (reports / exports, secondary reads).
 * **Atlas:** For most projects, use **Project → Database Access** →
 * **Add New Database User** → “Built-in role” or custom: **read** on `app_db` only
 * and put only that user in `MONGODB_ANALYTICS_URI`.
 *
 * **Self‑hosted (mongosh, logged in to `admin` with userAdmin):**
 *   MONGOSH_ANALYTICS_PWD="..." mongosh "mongodb://admin:.../admin" --file scripts/mongodb/create-analytics-readonly-user.mongosh.js
 */
const appDb = "app_db";
const name = "1commandai_analytics_read";
const pwd = process?.env?.MONGOSH_ANALYTICS_PWD || "NEVER_USE_DEFAULT_IN_PROD";

if (pwd === "NEVER_USE_DEFAULT_IN_PROD") {
  print("Set MONGOSH_ANALYTICS_PWD in the environment, or create the user in Atlas UI.");
} else {
  const adm = db.getSiblingDB("admin");
  try {
    adm.createUser({
      user: name,
      pwd: pwd,
      roles: [{ role: "read", db: appDb }],
    });
    print(`Created user ${name} with read on ${appDb}`);
  } catch (e) {
    if (e?.code === 11000 || String(e?.message).includes("already exists")) {
      print("User may already exist; idempotent re-run: skip or update password in Atlas / admin.");
    } else {
      print("createUser error:", e.message);
    }
  }
}

void appDb;
