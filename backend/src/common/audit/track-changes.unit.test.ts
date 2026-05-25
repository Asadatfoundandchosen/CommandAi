import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAuditChanges, deepEqual, trackChanges } from "./track-changes.js";

describe("trackChanges", () => {
  it("returns empty map when snapshots match", () => {
    const doc = { name: "Acme", status: "active", _id: "abc" };
    assert.deepEqual(trackChanges(doc, { ...doc }), {});
  });

  it("skips internal audit metadata fields", () => {
    const before = { name: "A", updated_at: new Date("2020-01-01") };
    const after = { name: "B", updated_at: new Date("2026-01-01") };
    const diff = trackChanges(before, after);
    assert.deepEqual(Object.keys(diff), ["name"]);
    assert.equal(diff.name?.from, "A");
    assert.equal(diff.name?.to, "B");
  });

  it("detects nested object changes", () => {
    const before = { budget: { allocated: 100, used: 10 } };
    const after = { budget: { allocated: 100, used: 20 } };
    const diff = trackChanges(before, after);
    assert.ok(diff.budget);
    assert.deepEqual(diff.budget.from, before.budget);
    assert.deepEqual(diff.budget.to, after.budget);
  });

  it("buildAuditChanges redacts sensitive fields in diff", () => {
    const changes = buildAuditChanges(
      { email: "a@b.com", password_hash: "secret" },
      { email: "c@d.com", password_hash: "other" },
    );
    assert.equal(changes?.before?.password_hash, "[REDACTED]");
    assert.equal(changes?.after?.password_hash, "[REDACTED]");
    assert.equal(changes?.diff?.email?.from, "a@b.com");
    assert.equal(changes?.diff?.email?.to, "c@d.com");
  });
});

describe("deepEqual", () => {
  it("compares dates by ISO string", () => {
    assert.equal(
      deepEqual(new Date("2024-01-01T00:00:00.000Z"), new Date("2024-01-01T00:00:00.000Z")),
      true,
    );
  });
});
