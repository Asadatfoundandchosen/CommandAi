import assert from "node:assert/strict";
import { test } from "node:test";

import { parseIdpMetadataXml } from "./saml-metadata.parser.js";
import { extractEmailFromSamlUser, normalizePemCertificate } from "./saml.logic.js";

test("extractEmailFromSamlUser reads Azure AD email claim", () => {
  const email = extractEmailFromSamlUser({
    name_id: "opaque-id",
    attributes: {
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress":
        "User@Contoso.com",
    },
  });
  assert.equal(email, "user@contoso.com");
});

test("extractEmailFromSamlUser falls back to email NameID", () => {
  const email = extractEmailFromSamlUser({
    name_id: "admin@example.com",
  });
  assert.equal(email, "admin@example.com");
});

test("parseIdpMetadataXml extracts SSO URL and certificate", () => {
  const xml = `<?xml version="1.0"?>
<EntityDescriptor entityID="https://idp.example.com">
  <IDPSSODescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/sso"/>
    <SingleLogoutService Location="https://idp.example.com/slo"/>
    <KeyDescriptor use="signing">
      <KeyInfo>
        <X509Data>
          <X509Certificate>MIIBkTCB+wIJAKoZIhvcNAQcB</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`;

  const parsed = parseIdpMetadataXml(xml);
  assert.equal(parsed.idp_login_url, "https://idp.example.com/sso");
  assert.equal(parsed.idp_logout_url, "https://idp.example.com/slo");
  assert.equal(parsed.idp_certificates.length, 1);
  assert.match(parsed.idp_certificates[0], /BEGIN CERTIFICATE/);
});

test("normalizePemCertificate wraps bare base64 body", () => {
  const pem = normalizePemCertificate("YWJjZGVm");
  assert.match(pem, /BEGIN CERTIFICATE/);
  assert.match(pem, /END CERTIFICATE/);
});
