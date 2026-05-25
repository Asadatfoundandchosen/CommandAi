import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizePhoneNumber, validatePhoneNumber } from "./phone.validation.js";

test("normalizePhoneNumber strips formatting characters", () => {
  assert.equal(normalizePhoneNumber("  +44 20 7946 0958  "), "+442079460958");
});

test("validatePhoneNumber rejects too short E.164", () => {
  assert.throws(() => validatePhoneNumber("+12345"));
});
