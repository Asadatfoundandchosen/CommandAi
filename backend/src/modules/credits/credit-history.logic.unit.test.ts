import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTransactionQuery,
  escapeCsvField,
} from "./credit-history.logic.js";

describe("buildTransactionQuery", () => {
  const orgId = "507f1f77bcf86cd799439011";

  it("scopes by org_id", () => {
    const { filter } = buildTransactionQuery(orgId, {});
    assert.equal(String(filter.org_id), orgId);
  });

  it("applies account, type, and date range filters", () => {
    const accountId = "507f1f77bcf86cd799439012";
    const from = new Date("2025-01-01T00:00:00.000Z");
    const to = new Date("2025-01-31T23:59:59.999Z");
    const { filter, limit, offset } = buildTransactionQuery(orgId, {
      accountId,
      type: "consumption",
      from,
      to,
      limit: 50,
      offset: 10,
    });
    assert.equal(String(filter.account_id), accountId);
    assert.equal(filter.type, "consumption");
    assert.deepEqual(filter.created_at, { $gte: from, $lte: to });
    assert.equal(limit, 50);
    assert.equal(offset, 10);
  });

  it("caps limit at 500", () => {
    const { limit } = buildTransactionQuery(orgId, { limit: 9999 });
    assert.equal(limit, 500);
  });
});

describe("escapeCsvField", () => {
  it("quotes fields with commas", () => {
    assert.equal(escapeCsvField('hello, world'), '"hello, world"');
  });
});
