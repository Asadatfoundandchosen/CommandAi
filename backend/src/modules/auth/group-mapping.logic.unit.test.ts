import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractIdpGroupsFromSsoProfile,
  getHighestRole,
  pickMappingForRole,
} from "./group-mapping.logic.js";
import type { GroupRoleMappingEntry } from "./group-mapping.model.js";
import type { SSOProfile } from "./sso-profile.types.js";

test("getHighestRole picks org_admin over dept_user", () => {
  const role = getHighestRole(["dept_user", "account_admin", "org_admin", "dept_manager"]);
  assert.equal(role, "org_admin");
});

test("getHighestRole returns null for empty list", () => {
  assert.equal(getHighestRole([]), null);
});

test("extractIdpGroupsFromSsoProfile reads groups claim", () => {
  const profile: SSOProfile = {
    email: "u@x.com",
    sub: "1",
    provider: "oidc",
    attributes: { groups: ["Admins", "Engineering"] },
  };
  const groups = extractIdpGroupsFromSsoProfile(profile);
  assert.ok(groups.includes("Admins"));
  assert.ok(groups.includes("Engineering"));
});

test("extractIdpGroupsFromSsoProfile reads Azure groups claim URI", () => {
  const profile: SSOProfile = {
    email: "u@x.com",
    sub: "1",
    provider: "microsoft",
    attributes: {
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups": "Platform-Admins",
    },
  };
  assert.deepEqual(extractIdpGroupsFromSsoProfile(profile), ["Platform-Admins"]);
});

test("pickMappingForRole prefers scoped mapping", () => {
  const accountId = "aaaaaaaaaaaaaaaaaaaaaaaa" as unknown as GroupRoleMappingEntry["account_id"];
  const departmentId = "bbbbbbbbbbbbbbbbbbbbbbbb" as unknown as GroupRoleMappingEntry["department_id"];
  const matched: GroupRoleMappingEntry[] = [
    { idp_group: "A", role: "dept_manager" },
    {
      idp_group: "B",
      role: "dept_manager",
      account_id: accountId,
      department_id: departmentId,
    },
  ];
  const picked = pickMappingForRole(matched, "dept_manager");
  assert.equal(picked?.idp_group, "B");
});
