import assert from "node:assert/strict";
import { test } from "node:test";

import { auditIndexName } from "../../infrastructure/search/index.js";
import {
  AUDIT_WRITE_OP_TYPE,
  buildAuditCreateIndexRequest,
} from "./audit.service.js";

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
