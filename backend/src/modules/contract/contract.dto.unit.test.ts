import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";

import {
  buildExpiryNotifications,
  daysUntilDate,
  resolveExpiryAlertLevel,
  toContractDetailView,
} from "./contract.dto.js";
import type { IContract } from "./contract.model.js";

function sampleContract(overrides: Partial<IContract> = {}): IContract {
  const now = new Date("2026-05-21T12:00:00.000Z");
  return {
    _id: new mongoose.Types.ObjectId(),
    org_id: new mongoose.Types.ObjectId(),
    contract_number: "CTR-2026-001",
    status: "active",
    type: "enterprise",
    start_date: new Date("2026-01-01T00:00:00.000Z"),
    end_date: new Date("2026-06-21T00:00:00.000Z"),
    auto_renew: true,
    billing: {
      plan: "enterprise",
      billing_cycle: "annual",
      amount: 12000,
      currency: "USD",
    },
    credits: { initial_allocation: 10000, renewal_allocation: 10000 },
    created_by: new mongoose.Types.ObjectId(),
    created_at: now,
    updated_by: new mongoose.Types.ObjectId(),
    updated_at: now,
    is_deleted: false,
    ...overrides,
  };
}

test("daysUntilDate uses UTC calendar days", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");
  const end = new Date("2026-05-28T00:00:00.000Z");
  assert.equal(daysUntilDate(end, now), 7);
});

test("toContractDetailView sets days_until_renewal when auto_renew", () => {
  const contract = sampleContract({ auto_renew: true });
  const view = toContractDetailView(contract, new Date("2026-05-21T12:00:00.000Z"));
  assert.equal(view.days_until_renewal, 31);
  assert.equal(view.days_until_expiry, 31);
  assert.equal(view.expiry_alert, "none");
});

test("toContractDetailView omits days_until_renewal without auto_renew", () => {
  const contract = sampleContract({ auto_renew: false });
  const view = toContractDetailView(contract, new Date("2026-05-21T12:00:00.000Z"));
  assert.equal(view.days_until_renewal, null);
});

test("resolveExpiryAlertLevel critical within 7 days", () => {
  assert.equal(resolveExpiryAlertLevel(7), "critical");
  assert.equal(resolveExpiryAlertLevel(-1), "expired");
});

test("buildExpiryNotifications at 7-day threshold", () => {
  const contract = sampleContract({
    end_date: new Date("2026-05-28T00:00:00.000Z"),
  });
  const notes = buildExpiryNotifications(contract, new Date("2026-05-21T12:00:00.000Z"));
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.severity, "critical");
  assert.match(notes[0]?.message ?? "", /ends in 7 days/);
});
