import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Types } from "mongoose";

import {
  canonicalAuditChecksumPayload,
  createAuditChecksum,
  verifyAuditChecksum,
  verifyAuditChecksumFromSearchDocument,
} from "./audit-checksum.js";

const sample = {
  timestamp: new Date("2026-04-15T12:00:00.000Z"),
  action: "users.updated",
  actor: {
    type: "user" as const,
    id: new Types.ObjectId("507f1f77bcf86cd799439012"),
    email: "auditor@example.com",
    ip_address: "203.0.113.1",
    user_agent: "curl/8.0",
  },
  resource: {
    type: "users",
    id: new Types.ObjectId("507f1f77bcf86cd799439013"),
    name: "Jane Doe",
  },
};

describe("createAuditChecksum", () => {
  it("is deterministic for the same payload", () => {
    const a = createAuditChecksum(sample);
    const b = createAuditChecksum({ ...sample });
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("changes when action changes", () => {
    const base = createAuditChecksum(sample);
    const other = createAuditChecksum({ ...sample, action: "users.deleted" });
    assert.notEqual(base, other);
  });

  it("verifyAuditChecksum accepts matching checksum", () => {
    const checksum = createAuditChecksum(sample);
    assert.equal(verifyAuditChecksum(sample, checksum), true);
  });

  it("verifyAuditChecksum rejects tampered checksum", () => {
    const checksum = createAuditChecksum(sample);
    assert.equal(verifyAuditChecksum({ ...sample, action: "tampered" }, checksum), false);
  });

  it("verifyAuditChecksum skips legacy records without checksum", () => {
    assert.equal(verifyAuditChecksum(sample, undefined), true);
  });
});

describe("verifyAuditChecksumFromSearchDocument", () => {
  it("validates flattened OpenSearch documents", () => {
    const checksum = createAuditChecksum(sample);
    const doc = {
      timestamp: sample.timestamp.toISOString(),
      org_id: "507f1f77bcf86cd799439011",
      action: sample.action,
      actor_type: sample.actor.type,
      actor_id: String(sample.actor.id),
      actor_email: sample.actor.email,
      ip_address: sample.actor.ip_address,
      user_agent: sample.actor.user_agent,
      resource_type: sample.resource.type,
      resource_id: String(sample.resource.id),
      resource_name: sample.resource.name,
      checksum,
    };
    assert.equal(verifyAuditChecksumFromSearchDocument(doc), true);
  });

  it("uses canonical payload stable key ordering", () => {
    const payload = JSON.parse(canonicalAuditChecksumPayload(sample));
    assert.equal(payload.action, "users.updated");
    assert.ok(payload.actor.id);
  });
});
