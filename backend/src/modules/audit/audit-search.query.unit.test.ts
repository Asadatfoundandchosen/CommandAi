import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAuditSearchQueryBody } from "./audit-search.query.js";

describe("buildAuditSearchQueryBody", () => {
  it("scopes search to org_id", () => {
    const body = buildAuditSearchQueryBody("507f1f77bcf86cd799439011", {});
    assert.deepEqual(body.query, {
      bool: {
        must: [{ term: { org_id: "507f1f77bcf86cd799439011" } }],
      },
    });
  });

  it("applies time range in filter clause", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T23:59:59.999Z");
    const body = buildAuditSearchQueryBody("org1", { from, to });
    const bool = body.query.bool as { filter: object[] };
    assert.equal(bool.filter.length, 1);
  });

  it("adds actor, action, resource, and full-text filters", () => {
    const body = buildAuditSearchQueryBody("org1", {
      actor_id: "507f1f77bcf86cd799439012",
      action: "users.updated",
      resource_type: "users",
      resource_id: "507f1f77bcf86cd799439013",
      q: "login failed",
      page: 2,
      limit: 50,
    });
    const must = (body.query.bool as { must: object[] }).must;
    assert.ok(must.length >= 5);
    assert.equal(body.from, 50);
    assert.equal(body.size, 50);
    assert.ok(body.aggs?.by_action);
  });

  it("omits aggregations when include_aggs is false", () => {
    const body = buildAuditSearchQueryBody("org1", { include_aggs: false });
    assert.equal(body.aggs, undefined);
  });
});
