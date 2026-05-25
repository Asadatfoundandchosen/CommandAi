import assert from "node:assert/strict";
import { test } from "node:test";

import { applyScimGroupPatch, applyScimUserPatch } from "./scim-patch.js";

test("applyScimUserPatch replaces active flag", () => {
  const result = applyScimUserPatch(
    { active: true, userName: "u@x.com" },
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: false }],
    },
  );
  assert.equal(result.active, false);
});

test("applyScimGroupPatch replaces members", () => {
  const result = applyScimGroupPatch({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
    Operations: [
      {
        op: "replace",
        path: "members",
        value: [{ value: "507f1f77bcf86cd799439011" }],
      },
    ],
  });
  assert.deepEqual(result.memberIds, ["507f1f77bcf86cd799439011"]);
});
