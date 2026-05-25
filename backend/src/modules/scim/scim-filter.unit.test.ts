import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGroupMongoFilter,
  buildUserMongoFilter,
  parseScimFilter,
} from "./scim-filter.js";

test("parseScimFilter parses userName eq", () => {
  const f = parseScimFilter('userName eq "alice@example.com"');
  assert.ok(f);
  assert.equal(f!.field, "username");
  assert.equal(f!.operator, "eq");
  assert.equal(f!.value, "alice@example.com");
});

test("buildUserMongoFilter maps userName to email", () => {
  const f = parseScimFilter('userName eq "bob@example.com"');
  const mongo = buildUserMongoFilter("507f1f77bcf86cd799439011", f);
  assert.equal(mongo.email, "bob@example.com");
  assert.equal(mongo.is_deleted, false);
});

test("buildGroupMongoFilter maps displayName eq", () => {
  const f = parseScimFilter('displayName eq "Engineering"');
  const mongo = buildGroupMongoFilter("507f1f77bcf86cd799439011", f);
  assert.ok(mongo.display_name instanceof RegExp);
});
