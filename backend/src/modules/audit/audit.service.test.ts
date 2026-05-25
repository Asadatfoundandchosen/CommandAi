import assert from "node:assert/strict";
import { test } from "node:test";

import { auditIndexName } from "../../infrastructure/search/index.js";
import {
  AUDIT_WRITE_OP_TYPE,
  auditLogToSearchDocument,
  buildAuditCreateIndexRequest,
} from "./audit.service.js";
import type { IAuditLog } from "./audit.model.js";
import { Types } from "mongoose";

test("auditIndexName uses monthly audit-YYYY.MM", () => {
  assert.equal(
    auditIndexName(new Date(Date.UTC(2026, 3, 15))),
    "audit-2026.04",
  );
});

test("buildAuditCreateIndexRequest is create-only (immutability)", () => {
  const req = buildAuditCreateIndexRequest(
    {
      timestamp: "2026-04-15T12:00:00.000Z",
      org_id: "org_1",
      action: "user.login",
      resource: "session",
    },
    { forDate: new Date(Date.UTC(2026, 3, 1)) },
  );
  assert.equal(req.op_type, AUDIT_WRITE_OP_TYPE);
  assert.equal(req.op_type, "create");
  assert.equal(req.index, "audit-2026.04");
  assert.equal(req.refresh, false);
  assert.ok("update" in req === false);
});

test("buildAuditCreateIndexRequest passes optional id for idempotent create", () => {
  const req = buildAuditCreateIndexRequest(
    {
      timestamp: "2026-04-15T12:00:00.000Z",
      org_id: "org_1",
      action: "x",
      resource: "y",
    },
    { id: "evt-uuid-1", forDate: new Date(Date.UTC(2026, 3, 1)) },
  );
  assert.equal(req.id, "evt-uuid-1");
  assert.equal(req.op_type, "create");
});

test("auditLogToSearchDocument flattens actor and resource for OpenSearch", () => {
  const log: IAuditLog = {
    _id: new Types.ObjectId(),
    timestamp: new Date("2026-04-15T12:00:00.000Z"),
    org_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
    actor: {
      type: "user",
      id: new Types.ObjectId("507f1f77bcf86cd799439012"),
      email: "auditor@example.com",
      ip_address: "203.0.113.1",
      user_agent: "curl/8.0",
    },
    action: "users.updated",
    resource: {
      type: "users",
      id: new Types.ObjectId("507f1f77bcf86cd799439013"),
      name: "Jane Doe",
    },
    changes: { before: { status: "pending" }, after: { status: "active" } },
    request_id: "req-123",
    trace_id: "trace-456",
  };
  const doc = auditLogToSearchDocument(log);
  assert.equal(doc.actor_type, "user");
  assert.equal(doc.user_id, String(log.actor.id));
  assert.equal(doc.resource_type, "users");
  assert.equal(doc.resource_id, String(log.resource.id));
  assert.equal(doc.request_id, "req-123");
  assert.equal(doc.trace_id, "trace-456");
});

test("auditLogToSearchDocument includes checksum when present", () => {
  const log: IAuditLog = {
    _id: new Types.ObjectId(),
    timestamp: new Date("2026-04-15T12:00:00.000Z"),
    org_id: new Types.ObjectId("507f1f77bcf86cd799439011"),
    actor: {
      type: "user",
      id: new Types.ObjectId("507f1f77bcf86cd799439012"),
      ip_address: "203.0.113.1",
      user_agent: "curl/8.0",
    },
    action: "users.updated",
    resource: {
      type: "users",
      id: new Types.ObjectId("507f1f77bcf86cd799439013"),
    },
    request_id: "req-123",
    checksum: "abc123checksum",
  };
  const doc = auditLogToSearchDocument(log);
  assert.equal(doc.checksum, "abc123checksum");
});
