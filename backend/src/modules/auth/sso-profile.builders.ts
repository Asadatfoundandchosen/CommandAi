import { extractEmailFromSamlUser, type SamlUserLike } from "./saml.logic.js";
import { extractEmailFromOidcClaims } from "./oidc.logic.js";
import type { SSOProfile, SsoProvider } from "./sso-profile.types.js";

export class SsoProfileMissingEmailError extends Error {
  constructor() {
    super("SSO profile missing email");
    this.name = "SsoProfileMissingEmailError";
  }
}

export function buildOidcSsoProfile(
  claims: Record<string, unknown>,
  provider?: SsoProvider,
): SSOProfile {
  const email = extractEmailFromOidcClaims(claims);
  if (!email) {
    throw new SsoProfileMissingEmailError();
  }
  const sub =
    typeof claims.sub === "string" && claims.sub.length > 0
      ? claims.sub
      : email;

  return {
    email,
    sub,
    provider: provider ?? "oidc",
    attributes: claims,
  };
}

export function buildSamlSsoProfile(
  user: SamlUserLike,
  provider?: SsoProvider,
): SSOProfile {
  const email = extractEmailFromSamlUser(user);
  if (!email) {
    throw new SsoProfileMissingEmailError();
  }
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(user.attributes ?? {})) {
    attrs[key] = Array.isArray(value) ? value[0] : value;
  }

  const sub =
    typeof user.name_id === "string" && user.name_id.length > 0
      ? user.name_id
      : email;

  return {
    email,
    sub,
    provider: provider ?? "saml",
    attributes: attrs,
  };
}
