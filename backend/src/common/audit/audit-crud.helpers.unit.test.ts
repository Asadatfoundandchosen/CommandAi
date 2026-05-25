import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSoftDelete,
  resolveCrudAction,
  resolveOrgId,
  resolveResourceName,
} from "./audit-crud.helpers.js";

test("resolveOrgId prefers document org_id", () => {
  const id = resolveOrgId(
    { org_id: "507f1f77bcf86cd799439011" },
    "users",
  );
  assert.equal(String(id), "507f1f77bcf86cd799439011");
});

test("resolveOrgId uses organization _id for organizations collection", () => {
  const id = resolveOrgId(
    { _id: "507f1f77bcf86cd799439012" },
    "organizations",
  );
  assert.equal(String(id), "507f1f77bcf86cd799439012");
});

test("resolveOrgId reads org_id from bulk filter", () => {
  const id = resolveOrgId(null, "users", undefined, {
    org_id: "507f1f77bcf86cd799439013",
  });
  assert.equal(String(id), "507f1f77bcf86cd799439013");
});

test("resolveResourceName picks name then email", () => {
  assert.equal(resolveResourceName({ name: " Acme " }), "Acme");
  assert.equal(resolveResourceName({ email: "a@b.com" }), "a@b.com");
});

test("isSoftDelete detects is_deleted transition", () => {
  assert.equal(
    isSoftDelete({ is_deleted: false }, { is_deleted: true }),
    true,
  );
  assert.equal(
    isSoftDelete({ is_deleted: true }, { is_deleted: true }),
    false,
  );
});

test("resolveCrudAction maps soft delete to deleted", () => {
  assert.equal(
    resolveCrudAction(
      "users",
      "updated",
      { is_deleted: false },
      { is_deleted: true },
    ),
    "users.deleted",
  );
});

test("resolveCrudAction keeps updated for normal changes", () => {
  assert.equal(
    resolveCrudAction(
      "users",
      "updated",
      { status: "pending" },
      { status: "active" },
    ),
    "users.updated",
  );
});
