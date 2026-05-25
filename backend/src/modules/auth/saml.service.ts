import { inject, injectable } from "inversify";
import * as saml2 from "saml2-js";

import { config } from "@config/index.js";
import { decryptField, encryptField } from "@common/utils/field-encryption.js";
import type { IOrganization, OrgSamlConfig } from "@modules/organization/organization.model.js";
import { OrganizationModel } from "@modules/organization/organization.model.js";
import { TYPES } from "../../types.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import type { AdminAuditActor } from "../audit/admin-audit.service.js";

import { GroupMappingService } from "./group-mapping.service.js";
import {
  JitProvisioningService,
  SsoUserNotFoundError,
} from "./jit-provisioning.service.js";
import { buildSamlSsoProfile } from "./sso-profile.builders.js";
import type { SsoProvider } from "./sso-profile.types.js";
import { parseIdpMetadataXml } from "./saml-metadata.parser.js";
import { logAuthTokenOperation } from "./auth-token.logger.js";
import type { LoginResult } from "./auth.service.js";
import { AuthService } from "./auth.service.js";
import type { ClientContext } from "./auth-session.types.js";
import {
  clearSamlSession,
  loadSamlSession,
  saveSamlSession,
} from "./saml-session.store.js";
import type { UpsertOrgSamlConfigBody } from "./saml.validation.js";

export class SamlNotConfiguredError extends Error {
  constructor() {
    super("SAML SSO is not configured for this organization");
    this.name = "SamlNotConfiguredError";
  }
}

export class SamlAssertionError extends Error {
  constructor(message = "Invalid or unsigned SAML assertion") {
    super(message);
    this.name = "SamlAssertionError";
  }
}

export class SamlUserNotFoundError extends Error {
  constructor() {
    super("No active user matches the SAML assertion for this organization");
    this.name = "SamlUserNotFoundError";
  }
}

export type OrgSamlConfigView = Omit<OrgSamlConfig, "sp_private_key_enc"> & {
  org_id: string;
  sp_entity_id: string;
  assert_endpoint: string;
  login_url: string;
  metadata_url: string;
};

type SamlResponseUser = {
  name_id: string;
  session_index?: string;
  attributes?: Record<string, string | string[] | undefined>;
};

@injectable()
export class SamlService {
  constructor(
    @inject(TYPES.AuthService) private readonly auth: AuthService,
    @inject(JitProvisioningService) private readonly jit: JitProvisioningService,
    @inject(GroupMappingService) private readonly groupMapping: GroupMappingService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  spEntityId(orgId: string): string {
    return `${config.apiPublicUrl}/api/v1/auth/saml/${orgId}/metadata`;
  }

  assertEndpoint(orgId: string): string {
    return `${config.apiPublicUrl}/api/v1/auth/saml/${orgId}/callback`;
  }

  loginInitUrl(orgId: string): string {
    return `${config.apiPublicUrl}/api/v1/auth/saml/${orgId}/login`;
  }

  async getOrgSamlConfigView(orgId: string): Promise<OrgSamlConfigView | null> {
    const org = await this.loadOrg(orgId);
    if (!org?.saml) {
      return null;
    }
    return this.toConfigView(orgId, org.saml);
  }

  async upsertOrgSamlConfig(
    orgId: string,
    body: UpsertOrgSamlConfigBody,
    auditActor?: AdminAuditActor,
  ): Promise<OrgSamlConfigView> {
    const org = await this.loadOrg(orgId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const beforeView = org.saml ? this.toConfigView(orgId, org.saml) : null;

    let next: OrgSamlConfig = {
      ...(org.saml ?? { enabled: false, idp_login_url: "", idp_certificates: [] }),
      enabled: body.enabled,
      provider: body.provider ?? org.saml?.provider,
      force_authn: body.force_authn ?? org.saml?.force_authn ?? true,
    };

    if (body.idp_metadata_xml) {
      const parsed = parseIdpMetadataXml(body.idp_metadata_xml);
      next = {
        ...next,
        idp_metadata_xml: body.idp_metadata_xml,
        idp_entity_id: parsed.idp_entity_id ?? body.idp_entity_id,
        idp_login_url: parsed.idp_login_url,
        idp_logout_url: parsed.idp_logout_url ?? body.idp_logout_url,
        idp_certificates: parsed.idp_certificates,
      };
    } else {
      if (body.idp_login_url) {
        next.idp_login_url = body.idp_login_url;
      }
      if (body.idp_logout_url !== undefined) {
        next.idp_logout_url = body.idp_logout_url;
      }
      if (body.idp_entity_id !== undefined) {
        next.idp_entity_id = body.idp_entity_id;
      }
      if (body.idp_certificates) {
        next.idp_certificates = body.idp_certificates;
      }
    }

    if (body.sp_certificate) {
      next.sp_certificate = body.sp_certificate.trim();
    }
    if (body.sp_private_key) {
      next.sp_private_key_enc = encryptField(body.sp_private_key.trim());
    }

    if (next.enabled) {
      if (!next.idp_login_url || next.idp_certificates.length === 0) {
        throw new Error(
          "SAML requires idp_login_url and idp_certificates (or idp_metadata_xml)",
        );
      }
      const sp = this.resolveSpCredentials(next);
      if (!sp.certificate || !sp.privateKey) {
        throw new Error(
          "SAML requires SP certificate and private key (org or SAML_SP_* env)",
        );
      }
    }

    await OrganizationModel.updateOne(
      { _id: orgId },
      { $set: { saml: next } },
    );

    const view = this.toConfigView(orgId, next);
    if (auditActor) {
      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.SSO_CONFIGURED,
        orgId,
        auditActor,
        { type: "organization", id: orgId, name: org.name },
        {
          ...(beforeView ? { before: ssoConfigAuditSnapshot(beforeView) } : {}),
          after: ssoConfigAuditSnapshot(view),
        },
        { sso_type: "saml" },
      );
    }

    return view;
  }

  /** SP-initiated login — redirect URL to IdP (Okta / Azure AD / OneLogin). */
  async createLoginRedirectUrl(orgId: string): Promise<string> {
    const org = await this.requireSamlOrg(orgId);
    const sp = this.createServiceProvider(orgId, org.saml!);
    const idp = this.createIdentityProvider(org.saml!);

    const { login_url } = await this.promisifyCreateLoginRequest(sp, idp, {
      relay_state: orgId,
    });

    logAuthTokenOperation("saml_login_redirect", { org_id: orgId });
    return login_url;
  }

  /** ACS — validate signed POST assertion and issue JWT session. */
  async handleAssertionCallback(
    orgId: string,
    requestBody: Record<string, unknown>,
    clientContext?: ClientContext,
  ): Promise<LoginResult & { redirectUrl: string }> {
    const org = await this.requireSamlOrg(orgId);
    const sp = this.createServiceProvider(orgId, org.saml!);
    const idp = this.createIdentityProvider(org.saml!);

    const samlResponse = await this.promisifyPostAssert(sp, idp, requestBody);
    const userInfo = samlResponse.user as SamlResponseUser;
    const profile = buildSamlSsoProfile(
      userInfo,
      (org.saml?.provider as SsoProvider | undefined) ?? "saml",
    );

    let user;
    try {
      user = await this.jit.resolveUserForSsoLogin(orgId, profile);
    } catch (e) {
      if (e instanceof SsoUserNotFoundError) {
        logAuthTokenOperation("saml_login_failed", {
          org_id: orgId,
          reason: "user_not_found",
          email_domain: profile.email.split("@")[1] ?? "unknown",
        });
        throw new SamlUserNotFoundError();
      }
      throw e;
    }

    await this.groupMapping.syncUserGroupsFromProfile(String(user._id), profile);

    await saveSamlSession(String(user._id), {
      name_id: userInfo.name_id,
      session_index: userInfo.session_index,
      org_id: orgId,
    });

    const tokens = await this.auth.authenticateVerifiedUser(
      String(user._id),
      clientContext,
      undefined,
      { method: "saml" },
    );

    logAuthTokenOperation("saml_login_success", {
      org_id: orgId,
      user_id: String(user._id),
    });

    const redirectUrl = `${config.appUrl.replace(/\/$/, "")}/auth/saml/callback`;
    return { ...tokens, redirectUrl };
  }

  async createSpMetadata(orgId: string): Promise<string> {
    const org = await this.requireSamlOrg(orgId);
    const sp = this.createServiceProvider(orgId, org.saml!);
    return sp.create_metadata();
  }

  async createLogoutRedirectUrl(
    orgId: string,
    userId: string,
  ): Promise<string | null> {
    const org = await this.requireSamlOrg(orgId);
    if (!org.saml?.idp_logout_url) {
      return null;
    }

    const stored = await loadSamlSession(userId);
    if (!stored) {
      return null;
    }

    const sp = this.createServiceProvider(orgId, org.saml);
    const idp = this.createIdentityProvider(org.saml);

    const { request_url } = await this.promisifyCreateLogoutRequest(sp, idp, {
      name_id: stored.name_id,
      session_index: stored.session_index,
    });

    await clearSamlSession(userId);
    return request_url;
  }

  createServiceProvider(orgId: string, samlConfig: OrgSamlConfig): saml2.ServiceProvider {
    const { certificate, privateKey } = this.resolveSpCredentials(samlConfig);
    return new saml2.ServiceProvider({
      entity_id: this.spEntityId(orgId),
      assert_endpoint: this.assertEndpoint(orgId),
      certificate,
      private_key: privateKey,
      force_authn: samlConfig.force_authn ?? true,
      sign_get_request: false,
      allow_unencrypted_assertion: false,
    });
  }

  createIdentityProvider(samlConfig: OrgSamlConfig): saml2.IdentityProvider {
    return new saml2.IdentityProvider({
      sso_login_url: samlConfig.idp_login_url,
      sso_logout_url: samlConfig.idp_logout_url ?? samlConfig.idp_login_url,
      certificates: samlConfig.idp_certificates,
      allow_unencrypted_assertion: false,
      sign_get_request: false,
    });
  }

  private resolveSpCredentials(samlConfig: OrgSamlConfig): {
    certificate: string;
    privateKey: string;
  } {
    const certificate =
      samlConfig.sp_certificate?.trim() ??
      config.saml?.spCertificate ??
      "";
    let privateKey = "";
    if (samlConfig.sp_private_key_enc) {
      privateKey = decryptField(samlConfig.sp_private_key_enc);
    } else if (config.saml?.spPrivateKey) {
      privateKey = config.saml.spPrivateKey;
    }
    return { certificate, privateKey };
  }

  private toConfigView(orgId: string, saml: OrgSamlConfig): OrgSamlConfigView {
    const { sp_private_key_enc: _pk, ...rest } = saml;
    return {
      org_id: orgId,
      ...rest,
      sp_entity_id: this.spEntityId(orgId),
      assert_endpoint: this.assertEndpoint(orgId),
      login_url: this.loginInitUrl(orgId),
      metadata_url: `${this.spEntityId(orgId)}`,
    };
  }

  private async loadOrg(orgId: string): Promise<IOrganization | null> {
    return OrganizationModel.findById(orgId).lean<IOrganization | null>();
  }

  private async requireSamlOrg(orgId: string): Promise<IOrganization> {
    const org = await this.loadOrg(orgId);
    if (!org?.saml?.enabled || !org.saml.idp_login_url) {
      throw new SamlNotConfiguredError();
    }
    if (org.status === "suspended") {
      throw new SamlNotConfiguredError();
    }
    return org;
  }

  private promisifyCreateLoginRequest(
    sp: saml2.ServiceProvider,
    idp: saml2.IdentityProvider,
    options: saml2.CreateLoginRequestUrlOptions,
  ): Promise<{ login_url: string; request_id: string }> {
    return new Promise((resolve, reject) => {
      sp.create_login_request_url(idp, options, (err, login_url, request_id) => {
        if (err || !login_url) {
          reject(err ?? new SamlAssertionError("Failed to create SAML login URL"));
          return;
        }
        resolve({ login_url, request_id });
      });
    });
  }

  private promisifyPostAssert(
    sp: saml2.ServiceProvider,
    idp: saml2.IdentityProvider,
    requestBody: Record<string, unknown>,
  ): Promise<saml2.SAMLAssertResponse> {
    return new Promise((resolve, reject) => {
      sp.post_assert(
        idp,
        {
          request_body: requestBody,
          allow_unencrypted_assertion: false,
          notbefore_skew: 5,
        },
        (err, response) => {
          if (err || !response) {
            reject(err ?? new SamlAssertionError());
            return;
          }
          resolve(response);
        },
      );
    });
  }

  private promisifyCreateLogoutRequest(
    sp: saml2.ServiceProvider,
    idp: saml2.IdentityProvider,
    options: saml2.CreateLogoutRequestUrlOptions,
  ): Promise<{ request_url: string; request_id: string }> {
    return new Promise((resolve, reject) => {
      sp.create_logout_request_url(idp, options, (err, request_url, request_id) => {
        if (err || !request_url) {
          reject(err ?? new SamlAssertionError("Failed to create SAML logout URL"));
          return;
        }
        resolve({ request_url, request_id });
      });
    });
  }
}

function ssoConfigAuditSnapshot(
  config: Pick<
    OrgSamlConfigView,
  "enabled" | "provider" | "idp_login_url" | "idp_entity_id" | "idp_certificates" | "force_authn"
  >,
): Record<string, unknown> {
  return {
    enabled: config.enabled,
    provider: config.provider,
    idp_login_url: config.idp_login_url,
    idp_entity_id: config.idp_entity_id,
    idp_certificates_count: config.idp_certificates?.length ?? 0,
    force_authn: config.force_authn,
  };
}
