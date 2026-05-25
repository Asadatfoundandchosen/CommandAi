import type { Container } from "inversify";
import { Router } from "express";
import { z } from "zod";

import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { upsertGroupMappingBodySchema } from "../auth/group-mapping.validation.js";
import { upsertOrgOidcConfigBodySchema } from "../auth/oidc.validation.js";
import { upsertOrgSamlConfigBodySchema } from "../auth/saml.validation.js";
import {
  grantEmergencyAccessBodySchema,
  upsertSsoEnforcementBodySchema,
} from "../auth/sso-enforcement.validation.js";
import { upsertSsoMappingBodySchema } from "../auth/sso-mapping.validation.js";
import { MfaPolicyController } from "../mfa-policy/mfa-policy.controller.js";
import { upsertMfaPolicyBodySchema } from "../mfa-policy/mfa-policy.validation.js";
import { upsertScimConfigBodySchema } from "../scim/scim.validation.js";
import { OrganizationOidcController } from "./organization-oidc.controller.js";
import { OrganizationSamlController } from "./organization-saml.controller.js";
import { OrganizationGroupMappingController } from "./organization-group-mapping.controller.js";
import { OrganizationSsoEnforcementController } from "./organization-sso-enforcement.controller.js";
import { OrganizationScimController } from "./organization-scim.controller.js";
import { OrganizationSsoMappingController } from "./organization-sso-mapping.controller.js";
import { OrganizationController } from "./organization.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Tenant hierarchy
 *     description: |
 *       Tenant-scoped organization tree for admins (JWT `org_id` + **X-User-Role: org_admin**).
 *
 * /v1/organization/hierarchy:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Organization hierarchy dashboard (tree + counts)
 *     description: |
 *       Nested **Organization → Accounts → Departments** with **user counts per department**,
 *       plus rollup counts on each account and on the organization.
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *       401: { description: Missing JWT tenant or role }
 *       403: { description: Insufficient role }
 *       404: { description: Organization not found }
 *
 * /v1/organization/mfa-policy:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Get org MFA enforcement policy
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy with grace period metadata
 *   put:
 *     tags: [Tenant hierarchy]
 *     summary: Configure org MFA enforcement (org_admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled, required_for, grace_period_days, allowed_methods]
 *             properties:
 *               enabled: { type: boolean }
 *               required_for: { type: string, enum: [all, admins, none] }
 *               grace_period_days: { type: integer }
 *               allowed_methods:
 *                 type: array
 *                 items: { type: string, enum: [totp, sms, email, webauthn] }
 *               enforcement_date: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Updated policy
 *
 * /v1/organization/saml:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Get SAML SSO configuration for the org
 *     security:
 *       - bearerAuth: []
 *   put:
 *     tags: [Tenant hierarchy]
 *     summary: Configure SAML IdP metadata (Okta / Azure AD / OneLogin)
 *     security:
 *       - bearerAuth: []
 *
 * /v1/organization/oidc:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Get OIDC SSO configuration for the org
 *     security:
 *       - bearerAuth: []
 *   put:
 *     tags: [Tenant hierarchy]
 *     summary: Configure OIDC (Google / Microsoft / custom issuer)
 *     security:
 *       - bearerAuth: []
 *
 * /v1/organization/group-mapping:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Get IdP group to role mappings
 *     security:
 *       - bearerAuth: []
 *   put:
 *     tags: [Tenant hierarchy]
 *     summary: Configure IdP group to role mappings (sync on SSO login)
 *     security:
 *       - bearerAuth: []
 *
 * /v1/organization/sso-mapping:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Get JIT SSO attribute mapping and defaults
 *     security:
 *       - bearerAuth: []
 *   put:
 *     tags: [Tenant hierarchy]
 *     summary: Configure JIT provisioning (default role, department, attribute keys)
 *     security:
 *       - bearerAuth: []
 */
export function createOrganizationTenantRouter(container: Container): Router {
  const controller = container.get(OrganizationController);
  const mfaPolicy = container.get(MfaPolicyController);
  const orgSaml = container.get(OrganizationSamlController);
  const orgOidc = container.get(OrganizationOidcController);
  const ssoMapping = container.get(OrganizationSsoMappingController);
  const groupMapping = container.get(OrganizationGroupMappingController);
  const ssoEnforcement = container.get(OrganizationSsoEnforcementController);
  const scim = container.get(OrganizationScimController);
  const router = Router();
  router.get("/hierarchy", (req, res) => controller.hierarchyForTenant(req, res));
  router.get("/mfa-policy", (req, res) => mfaPolicy.get(req, res));
  router.put("/mfa-policy", validateZodBody(upsertMfaPolicyBodySchema), (req, res) =>
    mfaPolicy.upsert(req, res),
  );
  router.get("/saml", (req, res) => orgSaml.get(req, res));
  router.put("/saml", validateZodBody(upsertOrgSamlConfigBodySchema), (req, res) =>
    orgSaml.upsert(req, res),
  );
  router.get("/oidc", (req, res) => orgOidc.get(req, res));
  router.put("/oidc", validateZodBody(upsertOrgOidcConfigBodySchema), (req, res) =>
    orgOidc.upsert(req, res),
  );
  router.get("/sso-mapping", (req, res) => ssoMapping.get(req, res));
  router.put("/sso-mapping", validateZodBody(upsertSsoMappingBodySchema), (req, res) =>
    ssoMapping.upsert(req, res),
  );
  router.get("/group-mapping", (req, res) => groupMapping.get(req, res));
  router.put("/group-mapping", validateZodBody(upsertGroupMappingBodySchema), (req, res) =>
    groupMapping.upsert(req, res),
  );
  router.get("/sso-enforcement", (req, res) => ssoEnforcement.get(req, res));
  router.put("/sso-enforcement", validateZodBody(upsertSsoEnforcementBodySchema), (req, res) =>
    ssoEnforcement.upsert(req, res),
  );
  router.post("/emergency-access", validateZodBody(grantEmergencyAccessBodySchema), (req, res) =>
    ssoEnforcement.grantEmergency(req, res),
  );
  router.delete(
    "/emergency-access/:userId",
    validateZodParams(
      z.object({
        userId: z.string().regex(/^[a-fA-F0-9]{24}$/),
      }),
    ),
    (req, res) => ssoEnforcement.revokeEmergency(req, res),
  );
  router.get("/scim", (req, res) => scim.get(req, res));
  router.put("/scim", validateZodBody(upsertScimConfigBodySchema), (req, res) =>
    scim.upsert(req, res),
  );
  return router;
}
