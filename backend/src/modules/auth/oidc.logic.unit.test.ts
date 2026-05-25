import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractEmailFromOidcClaims,
  parseOidcScopes,
} from "./oidc.logic.js";

test("extractEmailFromOidcClaims reads email claim", () => {
  const email = extractEmailFromOidcClaims({
    sub: "abc",
    email: "User@Example.com",
  });
  assert.equal(email, "user@example.com");
});

test("extractEmailFromOidcClaims falls back to preferred_username", () => {
  const email = extractEmailFromOidcClaims({
    preferred_username: "admin@contoso.com",
  });
  assert.equal(email, "admin@contoso.com");
});

test("extractEmailFromOidcClaims reads Azure AD upn", () => {
  const email = extractEmailFromOidcClaims({
    upn: "user@tenant.onmicrosoft.com",
  });
  assert.equal(email, "user@tenant.onmicrosoft.com");
});

test("extractEmailFromOidcClaims returns null without email-like claim", () => {
  assert.equal(extractEmailFromOidcClaims({ sub: "opaque" }), null);
});

test("parseOidcScopes uses default when empty", () => {
  assert.equal(parseOidcScopes(), "openid profile email");
  assert.equal(parseOidcScopes("   "), "openid profile email");
});

test("parseOidcScopes preserves custom scopes", () => {
  assert.equal(parseOidcScopes("openid email"), "openid email");
});
