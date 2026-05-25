import { inject, injectable } from "inversify";

import { config } from "@config/index.js";
import type { IOrganization } from "@modules/organization/organization.model.js";
import { OrganizationModel } from "@modules/organization/organization.model.js";
import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

import { EmergencyAccessAlertService } from "./emergency-access-alert.service.js";
import { EmergencyAccessService } from "./emergency-access.service.js";
import type { SsoLoginUrls } from "./sso-enforcement.errors.js";
import { SSORequiredError } from "./sso-enforcement.errors.js";

export type PasswordlessLoginMethod = "password" | "magic_link";

export type SsoEnforcementView = {
  org_id: string;
  enforce: boolean;
  saml_enabled: boolean;
  oidc_enabled: boolean;
  saml_login_url: string | null;
  oidc_login_url: string | null;
};

export type SsoLoginOptions = {
  enforce: boolean;
  org_id: string | null;
  saml_login_url: string | null;
  oidc_login_url: string | null;
  message: string | null;
};

@injectable()
export class SsoEnforcementService {
  constructor(
    @inject(EmergencyAccessService) private readonly emergency: EmergencyAccessService,
    @inject(EmergencyAccessAlertService)
    private readonly emergencyAlert: EmergencyAccessAlertService,
  ) {}

  async getEnforcementForOrg(orgId: string): Promise<SsoEnforcementView> {
    const org = await OrganizationModel.findById(orgId).lean<IOrganization | null>();
    return this.buildEnforcementView(orgId, org);
  }

  async upsertEnforcement(orgId: string, enforce: boolean): Promise<SsoEnforcementView> {
    const org = await OrganizationModel.findById(orgId).lean<IOrganization | null>();
    if (!org) {
      throw new Error("Organization not found");
    }

    if (enforce) {
      const samlOk = org.saml?.enabled && org.saml.idp_login_url;
      const oidcOk = org.oidc?.enabled && org.oidc.issuer_url;
      if (!samlOk && !oidcOk) {
        throw new Error(
          "Enable and configure SAML or OIDC before requiring SSO login",
        );
      }
    }

    await OrganizationModel.updateOne(
      { _id: orgId },
      { $set: { "sso_settings.enforce": enforce } },
    );

    return this.getEnforcementForOrg(orgId);
  }

  /** Public login-page helper: resolve org + whether password login is blocked. */
  async getLoginOptions(email: string, orgIdHint?: string): Promise<SsoLoginOptions> {
    const normalized = email.trim().toLowerCase();
    const query: Record<string, unknown> = {
      email: normalized,
      is_deleted: false,
      status: "active",
    };
    if (orgIdHint) {
      query.org_id = orgIdHint;
    }

    const users = await UserModel.find(query).limit(2).lean<IUser[]>();
    if (users.length !== 1) {
      return {
        enforce: false,
        org_id: orgIdHint ?? null,
        saml_login_url: null,
        oidc_login_url: null,
        message: null,
      };
    }

    const orgId = String(users[0].org_id);
    const view = await this.getEnforcementForOrg(orgId);

    return {
      enforce: view.enforce,
      org_id: orgId,
      saml_login_url: view.saml_login_url,
      oidc_login_url: view.oidc_login_url,
      message: view.enforce
        ? "This organization requires SSO sign-in. Use the button below or contact your administrator."
        : null,
    };
  }

  /**
   * Block password / magic-link login when SSO is required.
   * Allows emergency access users (time-limited grant).
   */
  async checkSSOEnforcement(
    orgId: string,
    loginMethod: PasswordlessLoginMethod,
    email: string,
  ): Promise<void> {
    const org = await OrganizationModel.findById(orgId).lean<IOrganization | null>();
    if (!org?.sso_settings?.enforce) {
      return;
    }

    const user = await UserModel.findOne({
      org_id: orgId,
      email: email.trim().toLowerCase(),
      is_deleted: false,
    }).lean<IUser | null>();

    if (user && this.emergency.isEmergencyAccessActive(user)) {
      await this.emergencyAlert.alertEmergencyLogin({
        userId: String(user._id),
        orgId,
        loginMethod,
        expiresAt: user.emergency_access_expires_at!.toISOString(),
      });
      return;
    }

    const urls = this.ssoUrls(orgId, org);
    throw new SSORequiredError(urls);
  }

  private buildEnforcementView(
    orgId: string,
    org: IOrganization | null,
  ): SsoEnforcementView {
    const enforce = org?.sso_settings?.enforce ?? false;
    const samlEnabled = Boolean(org?.saml?.enabled && org.saml.idp_login_url);
    const oidcEnabled = Boolean(org?.oidc?.enabled && org.oidc.issuer_url);
    const urls = this.ssoUrls(orgId, org);

    return {
      org_id: orgId,
      enforce,
      saml_enabled: samlEnabled,
      oidc_enabled: oidcEnabled,
      saml_login_url: samlEnabled ? urls.saml_login_url : null,
      oidc_login_url: oidcEnabled ? urls.oidc_login_url : null,
    };
  }

  private ssoUrls(orgId: string, org: IOrganization | null): SsoLoginUrls {
    const base = config.apiPublicUrl.replace(/\/$/, "");
    const saml =
      org?.saml?.enabled && org.saml.idp_login_url
        ? `${base}/api/v1/auth/saml/${orgId}/login`
        : null;
    const oidc =
      org?.oidc?.enabled && org.oidc.issuer_url
        ? `${base}/api/v1/auth/oidc/${orgId}/login`
        : null;

    return {
      org_id: orgId,
      saml_login_url: saml,
      oidc_login_url: oidc,
    };
  }
}
