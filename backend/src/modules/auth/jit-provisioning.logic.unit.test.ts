import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mapAttribute,
  mapFirstName,
  mapLastName,
} from "./jit-provisioning.logic.js";
import type { SSOProfile } from "./sso-profile.types.js";

const profile = (attributes: Record<string, unknown>): SSOProfile => ({
  email: "user@example.com",
  sub: "sub-1",
  provider: "oidc",
  attributes,
});

test("mapAttribute reads configured key first", () => {
  const value = mapAttribute(
    profile({ custom_first: "Ada" }),
    "custom_first",
    ["given_name"],
  );
  assert.equal(value, "Ada");
});

test("mapAttribute falls back to given_name", () => {
  const value = mapAttribute(profile({ given_name: "Grace" }), undefined, [
    "given_name",
  ]);
  assert.equal(value, "Grace");
});

test("mapFirstName defaults to email local-part", () => {
  assert.equal(mapFirstName(profile({}), undefined), "user");
});

test("mapLastName defaults to SSO when no claim", () => {
  assert.equal(mapLastName(profile({}), undefined), "SSO");
});

test("mapFirstName uses SAML givenname claim URI", () => {
  const name = mapFirstName(
    profile({
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname":
        "Sam",
    }),
    undefined,
  );
  assert.equal(name, "Sam");
});
