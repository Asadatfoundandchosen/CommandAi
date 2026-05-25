export type SsoLoginUrls = {
  org_id: string;
  saml_login_url: string | null;
  oidc_login_url: string | null;
};

export class SSORequiredError extends Error {
  readonly code = "sso_required" as const;
  readonly sso: SsoLoginUrls;

  constructor(sso: SsoLoginUrls) {
    super("SSO login required for this organization");
    this.name = "SSORequiredError";
    this.sso = sso;
  }
}
