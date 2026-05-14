import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InvalidStatusTransitionError,
  assertValidStatusTransition,
} from "./organization.status-rules.js";

test("assertValidStatusTransition allows trial → active", () => {
  assertValidStatusTransition("trial", "active");
});

test("assertValidStatusTransition rejects active → trial", () => {
  assert.throws(
    () => assertValidStatusTransition("active", "trial"),
    (e: unknown) => e instanceof InvalidStatusTransitionError,
  );
});

test("assertValidStatusTransition allows suspended → active", () => {
  assertValidStatusTransition("suspended", "active");
});

test("assertValidStatusTransition no-op when same status", () => {
  assertValidStatusTransition("active", "active");
});
