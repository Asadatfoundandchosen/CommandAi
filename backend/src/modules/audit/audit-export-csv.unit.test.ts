import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditHitToCsvRow, auditHitsToCsv } from "./audit-export-csv.js";
import type { AuditEventSearchHit } from "./audit.types.js";

describe("auditHitsToCsv", () => {
  const sampleHit: AuditEventSearchHit = {
    _id: "abc123",
    _score: 1,
    integrity_valid: true,
    _source: {
      timestamp: "2026-05-25T12:00:00.000Z",
      actor_email: "auditor@example.com",
      action: "users.updated",
      resource_type: "users",
      resource_id: "507f1f77bcf86cd799439011",
      actor_id: "507f1f77bcf86cd799439012",
      ip_address: "203.0.113.10",
      request_id: "req-1",
    },
  };

  it("maps hit fields to CSV columns", () => {
    const row = auditHitToCsvRow(sampleHit);
    assert.equal(row[0], "2026-05-25T12:00:00.000Z");
    assert.equal(row[1], "auditor@example.com");
    assert.equal(row[2], "users.updated");
    assert.equal(row[3], "users");
    assert.equal(row[4], "507f1f77bcf86cd799439011");
  });

  it("includes header row", () => {
    const csv = auditHitsToCsv([sampleHit]);
    assert.ok(csv.startsWith("timestamp,actor_email,action,resource_type,resource_id"));
  });

  it("escapes commas in action text", () => {
    const hit: AuditEventSearchHit = {
      ...sampleHit,
      _source: { ...sampleHit._source, action: "note, with comma" },
    };
    const csv = auditHitsToCsv([hit]);
    assert.ok(csv.includes('"note, with comma"'));
  });
});
