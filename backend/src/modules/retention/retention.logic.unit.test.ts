import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUDIT_RETENTION_MIN_DAYS,
  DEFAULT_AUDIT_RETENTION_DAYS,
} from "./retention.constants.js";
import {
  computeRetentionCutoff,
  defaultArchiveLocation,
  normalizeArchiveLocation,
  resolveEffectivePolicy,
  subDays,
  validateRetentionDays,
} from "./retention.logic.js";

describe("retention.logic", () => {
  it("subDays subtracts calendar days in UTC", () => {
    const d = subDays(new Date("2026-05-25T12:00:00.000Z"), 10);
    assert.equal(d.toISOString(), "2026-05-15T12:00:00.000Z");
  });

  it("validateRetentionDays enforces minimum 365", () => {
    assert.throws(
      () => validateRetentionDays(364, 3650),
      /at least 365/,
    );
    assert.doesNotThrow(() => validateRetentionDays(365, 3650));
  });

  it("validateRetentionDays enforces platform maximum", () => {
    assert.throws(
      () => validateRetentionDays(4000, 3650),
      /must not exceed 3650/,
    );
  });

  it("resolveEffectivePolicy returns defaults when unset", () => {
    const p = resolveEffectivePolicy("507f1f77bcf86cd799439011", null);
    assert.equal(p.audit_retention_days, DEFAULT_AUDIT_RETENTION_DAYS);
    assert.equal(p.archive_before_delete, true);
    assert.equal(p.is_default, true);
    assert.ok(p.archive_location.includes("507f1f77bcf86cd799439011"));
  });

  it("normalizeArchiveLocation requires org-scoped prefix", () => {
    const orgId = "507f1f77bcf86cd799439011";
    assert.equal(
      normalizeArchiveLocation(orgId),
      defaultArchiveLocation(orgId),
    );
    assert.throws(
      () => normalizeArchiveLocation(orgId, "uploads/evil/"),
      /must start with audit-archives/,
    );
  });

  it("computeRetentionCutoff uses retention days", () => {
    const now = new Date("2026-05-25T00:00:00.000Z");
    const cutoff = computeRetentionCutoff(now, AUDIT_RETENTION_MIN_DAYS);
    assert.equal(cutoff.toISOString(), "2025-05-25T00:00:00.000Z");
  });
});
