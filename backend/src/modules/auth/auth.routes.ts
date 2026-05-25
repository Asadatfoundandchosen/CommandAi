import type { Container } from "inversify";
import express, { Router, type RequestHandler } from "express";

import {
  validateZodBody,
  validateZodParams,
  validateZodQuery,
} from "@common/middleware/validation.middleware.js";

import { AuthController } from "./auth.controller.js";
import {
  loginBodySchema,
  logoutBodySchema,
  magicLinkSendBodySchema,
  magicLinkVerifyBodySchema,
  mfaBackupCodesRegenerateBodySchema,
  mfaTotpDisableBodySchema,
  mfaTotpVerifyBodySchema,
  refreshBodySchema,
  revokeAllTokensBodySchema,
  sessionIdParamSchema,
  smsMfaSendBodySchema,
  smsMfaSendLoginBodySchema,
  smsMfaVerifyBodySchema,
} from "./auth.validation.js";
import { oidcOrgIdParamSchema } from "./oidc.validation.js";
import { OidcController } from "./oidc.controller.js";
import { samlOrgIdParamSchema } from "./saml.validation.js";
import { SamlController } from "./saml.controller.js";
import { ssoLoginOptionsQuerySchema } from "./sso-enforcement.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: JWT login, refresh, logout, revocation, and session management.
 *
 * /v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               org_id:
 *                 type: string
 *                 description: Required when the same email exists in multiple organizations
 *     responses:
 *       200:
 *         description: Access token (15m); refresh in httpOnly cookie + X-CSRF-Token header; optional refresh in JSON body
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked after repeated failed attempts (Retry-After header)
 *
 * /v1/auth/magic-link/send:
 *   post:
 *     tags: [Auth]
 *     summary: Send a passwordless magic sign-in link by email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *               org_id:
 *                 type: string
 *                 description: Required when the same email exists in multiple organizations
 *     responses:
 *       204:
 *         description: Request accepted (does not reveal whether the email is registered)
 *       429:
 *         description: Too many requests for this email
 *
 * /v1/auth/magic-link/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify magic link token and issue JWT pair
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "64-char hex token from the email link" }
 *               totp_code: { type: string, description: "Required when MFA is enabled" }
 *               backup_code: { type: string }
 *               sms_code: { type: string }
 *     responses:
 *       200:
 *         description: Access token; refresh in httpOnly cookie
 *       401:
 *         description: Invalid or expired token
 *       403:
 *         description: MFA required
 *
 * /v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate JWT pair using a valid refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access and refresh tokens
 *       401:
 *         description: Invalid, expired, reused, or blacklisted refresh token
 *
 * /v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and blacklist current tokens
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Optional refresh token to revoke immediately
 *     responses:
 *       204:
 *         description: Tokens blacklisted until natural expiry
 *       401:
 *         description: Missing or invalid bearer token
 *
 * /v1/auth/revoke-all:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke all JWTs for the caller or a target user (org_admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Target user ObjectId (org_admin only; default is caller)
 *     responses:
 *       200:
 *         description: User revocation epoch set and refresh tokens cleared
 *       403:
 *         description: Caller cannot revoke another user
 *
 * /v1/auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: List my active sessions (device, location, last active)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session list with `current` flag for this token
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke all sessions and tokens for the caller
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions revoked; caller must log in again
 *
 * /v1/auth/sessions/{id}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a single session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Session revoked
 *       404:
 *         description: Session not found
 *
 * /v1/auth/mfa/totp/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Start TOTP MFA setup (Google Authenticator compatible QR code)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Base32 secret and QR code data URL
 *
 * /v1/auth/mfa/totp/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify TOTP and enable MFA (returns one-time backup codes)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "6-digit TOTP code" }
 *     responses:
 *       200:
 *         description: MFA enabled with backup codes
 *
 * /v1/auth/mfa/backup-codes:
 *   get:
 *     tags: [Auth]
 *     summary: Backup code status (remaining count, low warning)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: remaining, total, low_warning (true when 3 or fewer remain)
 *
 * /v1/auth/mfa/backup-codes/regenerate:
 *   post:
 *     tags: [Auth]
 *     summary: Regenerate backup codes (invalidates previous set)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "6-digit TOTP code" }
 *     responses:
 *       200:
 *         description: New plaintext backup codes (shown once) and status
 *
 * /v1/auth/mfa/totp:
 *   delete:
 *     tags: [Auth]
 *     summary: Disable TOTP MFA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: "TOTP or backup code" }
 *     responses:
 *       204:
 *         description: MFA disabled
 *
 * /v1/auth/saml/{orgId}/login:
 *   get:
 *     tags: [Auth]
 *     summary: SP-initiated SAML 2.0 login (redirect to IdP)
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to Okta / Azure AD / OneLogin SSO URL
 *
 * /v1/auth/saml/{orgId}/callback:
 *   post:
 *     tags: [Auth]
 *     summary: SAML assertion consumer (ACS)
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Sets auth cookies and redirects to app
 *
 * /v1/auth/saml/{orgId}/metadata:
 *   get:
 *     tags: [Auth]
 *     summary: SP metadata XML for IdP configuration
 *
 * /v1/auth/oidc/{orgId}/login:
 *   get:
 *     tags: [Auth]
 *     summary: OIDC login (authorization code + PKCE; Google / Microsoft / custom)
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to OIDC provider
 *
 * /v1/auth/oidc/{orgId}/callback:
 *   get:
 *     tags: [Auth]
 *     summary: OIDC authorization callback
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Sets auth cookies and redirects to app
 */
export function createAuthRouter(
  container: Container,
  jwtAuth: RequestHandler,
): Router {
  const controller = container.get(AuthController);
  const saml = container.get(SamlController);
  const oidc = container.get(OidcController);
  const router = Router();
  const samlCallbackParser = express.urlencoded({ extended: false, limit: "2mb" });
  router.get(
    "/oidc/:orgId/login",
    validateZodParams(oidcOrgIdParamSchema),
    (req, res) => oidc.login(req, res),
  );
  router.get(
    "/oidc/:orgId/callback",
    validateZodParams(oidcOrgIdParamSchema),
    (req, res) => oidc.callback(req, res),
  );
  router.get(
    "/saml/:orgId/login",
    validateZodParams(samlOrgIdParamSchema),
    (req, res) => saml.login(req, res),
  );
  router.post(
    "/saml/:orgId/callback",
    validateZodParams(samlOrgIdParamSchema),
    samlCallbackParser,
    (req, res) => saml.callback(req, res),
  );
  router.get(
    "/saml/:orgId/metadata",
    validateZodParams(samlOrgIdParamSchema),
    (req, res) => saml.metadata(req, res),
  );
  router.post(
    "/saml/:orgId/logout",
    jwtAuth,
    validateZodParams(samlOrgIdParamSchema),
    (req, res) => saml.logout(req, res),
  );
  router.get(
    "/sso-login-options",
    validateZodQuery(ssoLoginOptionsQuerySchema),
    (req, res) => controller.ssoLoginOptions(req, res),
  );
  router.post("/login", validateZodBody(loginBodySchema), (req, res) =>
    controller.login(req, res),
  );
  router.post("/magic-link/send", validateZodBody(magicLinkSendBodySchema), (req, res) =>
    controller.sendMagicLink(req, res),
  );
  router.post("/magic-link/verify", validateZodBody(magicLinkVerifyBodySchema), (req, res) =>
    controller.verifyMagicLink(req, res),
  );
  router.post("/refresh", validateZodBody(refreshBodySchema), (req, res) =>
    controller.refresh(req, res),
  );
  router.post("/logout", jwtAuth, validateZodBody(logoutBodySchema), (req, res) =>
    controller.logout(req, res),
  );
  router.post("/revoke-all", jwtAuth, validateZodBody(revokeAllTokensBodySchema), (req, res) =>
    controller.revokeAll(req, res),
  );
  router.get("/sessions", jwtAuth, (req, res) => controller.listSessions(req, res));
  router.delete("/sessions", jwtAuth, (req, res) =>
    controller.revokeAllSessions(req, res),
  );
  router.delete(
    "/sessions/:id",
    jwtAuth,
    validateZodParams(sessionIdParamSchema),
    (req, res) => controller.revokeSession(req, res),
  );
  router.post("/mfa/totp/setup", jwtAuth, (req, res) => controller.setupTotp(req, res));
  router.post("/mfa/totp/verify", jwtAuth, validateZodBody(mfaTotpVerifyBodySchema), (req, res) =>
    controller.verifyTotp(req, res),
  );
  router.get("/mfa/backup-codes", jwtAuth, (req, res) =>
    controller.getBackupCodesStatus(req, res),
  );
  router.post(
    "/mfa/backup-codes/regenerate",
    jwtAuth,
    validateZodBody(mfaBackupCodesRegenerateBodySchema),
    (req, res) => controller.regenerateBackupCodes(req, res),
  );
  router.delete("/mfa/totp", jwtAuth, validateZodBody(mfaTotpDisableBodySchema), (req, res) =>
    controller.disableTotp(req, res),
  );
  router.post("/mfa/sms/send", jwtAuth, validateZodBody(smsMfaSendBodySchema), (req, res) =>
    controller.sendSmsMfa(req, res),
  );
  router.post("/mfa/sms/send-login", validateZodBody(smsMfaSendLoginBodySchema), (req, res) =>
    controller.sendSmsMfaLogin(req, res),
  );
  router.post("/mfa/sms/verify", jwtAuth, validateZodBody(smsMfaVerifyBodySchema), (req, res) =>
    controller.verifySmsMfa(req, res),
  );
  router.delete("/mfa/sms", jwtAuth, (req, res) => controller.disableSmsMfa(req, res));
  return router;
}
