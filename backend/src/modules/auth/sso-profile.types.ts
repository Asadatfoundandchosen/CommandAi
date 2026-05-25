/** IdP / protocol identifier stored on the user record. */
export type SsoProvider =
  | "saml"
  | "oidc"
  | "google"
  | "microsoft"
  | "custom"
  | "okta"
  | "azure_ad"
  | "onelogin"
  | "other";

/** Normalized identity from SAML assertion or OIDC token claims. */
export type SSOProfile = {
  email: string;
  sub: string;
  provider: SsoProvider;
  attributes: Record<string, unknown>;
};
