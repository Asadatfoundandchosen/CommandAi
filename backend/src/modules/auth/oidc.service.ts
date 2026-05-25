import { inject, injectable } from "inversify";
import { Issuer, type Client, generators } from "openid-client";

import { config } from "@config/index.js";
import { decryptField, encryptField } from "@common/utils/field-encryption.js";
import type { IOrganization, OrgOidcConfig } from "@modules/organization/organization.model.js";
import { OrganizationModel } from "@modules/organization/organization.model.js";
import { TYPES } from "../../types.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import type { AdminAuditActor } from "../audit/admin-audit.service.js";

import { logAuthTokenOperation } from "./auth-token.logger.js";
import type { LoginResult } from "./auth.service.js";
import { AuthService } from "./auth.service.js";
import type { ClientContext } from "./auth-session.types.js";
import { DEFAULT_OIDC_SCOPES } from "./oidc.constants.js";
import { parseOidcScopes } from "./oidc.logic.js";
import { consumeOidcPkce, saveOidcPkce } from "./oidc-pkce.store.js";
import type { UpsertOrgOidcConfigBody } from "./oidc.validation.js";
import { GroupMappingService } from "./group-mapping.service.js";
import {
  JitProvisioningService,
  SsoUserNotFoundError,
} from "./jit-provisioning.service.js";
import { buildOidcSsoProfile } from "./sso-profile.builders.js";
import type { SsoProvider } from "./sso-profile.types.js";

export class OidcNotConfiguredError extends Error {
  constructor() {
    super("OIDC SSO is not configured for this organization");
    this.name = "OidcNotConfiguredError";
  }
}

export class OidcCallbackError extends Error {
  constructor(message = "OIDC authorization failed") {
    super(message);
    this.name = "OidcCallbackError";
  }
}

export class OidcUserNotFoundError extends Error {
  constructor() {
    super("No active user matches the OIDC identity for this organization");
    this.name = "OidcUserNotFoundError";
  }
}

export type OrgOidcConfigView = Omit<OrgOidcConfig, "client_secret_enc"> & {
  org_id: string;
  redirect_uri: string;
  login_url: string;
};

type CallbackParams = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
};

@injectable()
export class OidcService {
  private issuerCache = new Map<string, Issuer>();

  constructor(
    @inject(TYPES.AuthService) private readonly auth: AuthService,
    @inject(JitProvisioningService) private readonly jit: JitProvisioningService,
    @inject(GroupMappingService) private readonly groupMapping: GroupMappingService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  redirectUri(orgId: string): string {
    return `${config.apiPublicUrl}/api/v1/auth/oidc/${orgId}/callback`;
  }

  loginInitUrl(orgId: string): string {
    return `${config.apiPublicUrl}/api/v1/auth/oidc/${orgId}/login`;
  }

  async getOrgOidcConfigView(orgId: string): Promise<OrgOidcConfigView | null> {
    const org = await OrganizationModel.findById(orgId).lean<IOrganization | null>();
    if (!org?.oidc) {
      return null;
    }
    return this.toConfigView(orgId, org.oidc);
  }

  async upsertOrgOidcConfig(
    orgId: string,
    body: UpsertOrgOidcConfigBody,
    auditActor?: AdminAuditActor,
  ): Promise<OrgOidcConfigView> {
    const org = await OrganizationModel.findById(orgId).lean<IOrganization | null>();
    if (!org) {
      throw new Error("Organization not found");
    }

    const beforeView = org.oidc ? this.toConfigView(orgId, org.oidc) : null;

    const next: OrgOidcConfig = {
      ...(org.oidc ?? {
        enabled: false,
        issuer_url: "",
        client_id: "",
        scopes: DEFAULT_OIDC_SCOPES,
      }),
      enabled: body.enabled,
      provider: body.provider ?? org.oidc?.provider,
      issuer_url: body.issuer_url ?? org.oidc?.issuer_url ?? "",
      client_id: body.client_id ?? org.oidc?.client_id ?? "",
      scopes: body.scopes ?? org.oidc?.scopes ?? DEFAULT_OIDC_SCOPES,
    };

    if (body.client_secret) {
      next.client_secret_enc = encryptField(body.client_secret);
    }

    if (next.enabled) {
      if (!next.issuer_url || !next.client_id) {
        throw new Error("OIDC requires issuer_url and client_id when enabled");
      }
      if (!next.client_secret_enc && !org.oidc?.client_secret_enc) {
        throw new Error("OIDC requires client_secret when enabling");
      }
      this.issuerCache.delete(next.issuer_url);
    }

    await OrganizationModel.updateOne({ _id: orgId }, { $set: { oidc: next } });

    const view = this.toConfigView(orgId, next);
    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.SSO_CONFIGURED,
        orgId,
        auditActor,
        { type: "organization", id: orgId, name: org.name },
        {
          ...(beforeView ? { before: oidcConfigAuditSnapshot(beforeView) } : {}),
          after: oidcConfigAuditSnapshot(view),
        },
        { sso_type: "oidc" },
      );
    }

    return view;
  }

  /** Authorization code flow with PKCE — returns IdP authorization URL. */
  async initiateLogin(orgId: string): Promise<string> {
    const org = await this.requireOidcOrg(orgId);
    const client = await this.getOidcClient(orgId, org.oidc!);

    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    await saveOidcPkce(state, { org_id: orgId, code_verifier: codeVerifier });

    const scopes = parseOidcScopes(org.oidc!.scopes);
    const authUrl = client.authorizationUrl({
      scope: scopes,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    logAuthTokenOperation("oidc_login_redirect", { org_id: orgId, provider: org.oidc!.provider });
    return authUrl;
  }

  /** Exchange authorization code + PKCE verifier for tokens and issue app session. */
  async handleCallback(
    orgId: string,
    params: CallbackParams,
    clientContext?: ClientContext,
  ): Promise<LoginResult & { redirectUrl: string }> {
    if (params.error) {
      throw new OidcCallbackError(
        params.error_description ?? params.error ?? "OIDC provider returned an error",
      );
    }

    if (!params.code || !params.state) {
      throw new OidcCallbackError("Missing code or state");
    }

    const pkce = await consumeOidcPkce(params.state);
    if (!pkce || pkce.org_id !== orgId) {
      throw new OidcCallbackError("Invalid or expired OIDC state");
    }

    const org = await this.requireOidcOrg(orgId);
    const client = await this.getOidcClient(orgId, org.oidc!);
    const redirectUri = this.redirectUri(orgId);

    const tokenSet = await client.callback(
      redirectUri,
      { code: params.code, state: params.state },
      { code_verifier: pkce.code_verifier, state: params.state },
    );

    const claims =
      tokenSet.claims() ??
      (typeof tokenSet.access_token === "string"
        ? await client.userinfo(tokenSet.access_token)
        : {});

    const claimRecord = claims as Record<string, unknown>;
    const profile = buildOidcSsoProfile(
      claimRecord,
      (org.oidc?.provider as SsoProvider | undefined) ?? "oidc",
    );

    let user;
    try {
      user = await this.jit.resolveUserForSsoLogin(orgId, profile);
    } catch (e) {
      if (e instanceof SsoUserNotFoundError) {
        logAuthTokenOperation("oidc_login_failed", {
          org_id: orgId,
          reason: "user_not_found",
          email_domain: profile.email.split("@")[1] ?? "unknown",
        });
        throw new OidcUserNotFoundError();
      }
      throw e;
    }

    await this.groupMapping.syncUserGroupsFromProfile(String(user._id), profile);

    const tokens = await this.auth.authenticateVerifiedUser(
      String(user._id),
      clientContext,
      undefined,
      { method: "oidc" },
    );

    logAuthTokenOperation("oidc_login_success", {
      org_id: orgId,
      user_id: String(user._id),
      provider: org.oidc!.provider,
    });

    const redirectUrl = `${config.appUrl.replace(/\/$/, "")}/auth/oidc/callback`;
    return { ...tokens, redirectUrl };
  }

  async getOidcClient(orgId: string, oidcConfig?: OrgOidcConfig): Promise<Client> {
    const org = oidcConfig
      ? ({ oidc: oidcConfig } as IOrganization)
      : await this.requireOidcOrg(orgId);
    const cfg = org.oidc!;

    let issuer = this.issuerCache.get(cfg.issuer_url);
    if (!issuer) {
      issuer = await Issuer.discover(cfg.issuer_url);
      this.issuerCache.set(cfg.issuer_url, issuer);
    }

    const clientSecret = cfg.client_secret_enc
      ? decryptField(cfg.client_secret_enc)
      : "";

    return new issuer.Client({
      client_id: cfg.client_id,
      client_secret: clientSecret,
      redirect_uris: [this.redirectUri(orgId)],
      response_types: ["code"],
    });
  }

  private toConfigView(orgId: string, oidc: OrgOidcConfig): OrgOidcConfigView {
    const { client_secret_enc: _secret, ...rest } = oidc;
    return {
      org_id: orgId,
      ...rest,
      redirect_uri: this.redirectUri(orgId),
      login_url: this.loginInitUrl(orgId),
    };
  }

  private async requireOidcOrg(orgId: string): Promise<IOrganization> {
    const org = await OrganizationModel.findById(orgId)
      .select("+oidc.client_secret_enc")
      .lean<IOrganization | null>();

    if (!org?.oidc?.enabled || !org.oidc.issuer_url || !org.oidc.client_id) {
      throw new OidcNotConfiguredError();
    }
    if (org.status === "suspended") {
      throw new OidcNotConfiguredError();
    }
    if (!org.oidc.client_secret_enc) {
      throw new OidcNotConfiguredError();
    }
    return org;
  }
}

function oidcConfigAuditSnapshot(
  config: Pick<
    OrgOidcConfigView,
    "enabled" | "provider" | "issuer_url" | "client_id" | "scopes"
  >,
): Record<string, unknown> {
  return {
    enabled: config.enabled,
    provider: config.provider,
    issuer_url: config.issuer_url,
    client_id: config.client_id,
    scopes: config.scopes,
    client_secret_set: true,
  };
}
