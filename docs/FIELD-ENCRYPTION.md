# Field-level encryption

Sensitive values are encrypted **before** persistence in MongoDB using **AES-256-GCM**.

## Key material

| Variable | Format | Notes |
| -------- | ------ | ----- |
| `FIELD_ENCRYPTION_KEY` | 64 hex chars (32 bytes) | **Required** in staging/production — load from **Vault KV** via External Secrets |
| `MFA_ENCRYPTION_KEY` | UTF-8 ≥32 bytes | Legacy decrypt for `v1:` ciphertext only |
| `APP_KMS_KEY_ARN` | (optional) | Application CMK from `kms-app-encryption` Terraform module |

Key lifecycle, rotation, and audit: **`docs/runbooks/key-management.md`**, **`infrastructure/vault/README.md`**.

## Wire format

- **v2 (current):** `base64( IV[12] || authTag[16] || ciphertext )`
- **v1 (legacy):** `v1:{iv}:{tag}:{data}` (base64url) — still decrypted for existing TOTP/SSO rows

## API

```typescript
import { encryptField, decryptField, searchableFieldToken } from "@common/encryption/field-encryption.js";
```

## Encrypted fields

| Collection | Fields | Searchable index |
| ---------- | ------ | ---------------- |
| `users` | `phone_number_enc`, `ssn_enc`, `mfa.totp_secret_enc` | `phone_number_search`, `ssn_search` |
| `organizations` | `oidc.client_secret_enc`, `saml.sp_private_key_enc` | — |
| `connectors` | `credentials_enc` | — |
| `api_keys` | — (uses `key_hash` only) | — |

## Mongoose plugin

```typescript
import { mongooseFieldEncryptionPlugin, USER_ENCRYPTED_FIELDS } from "@common/encryption/mongoose-field-encryption.plugin.js";

schema.plugin(mongooseFieldEncryptionPlugin, { fields: USER_ENCRYPTED_FIELDS });
```

- **save** — encrypts plaintext paths, unsets plaintext
- **find** / **findOne** — decrypts into plaintext paths in memory
- **updateOne** — use `encryptFieldsForUpdate()` (save hooks do not run)

## Searchable encryption

Equality search (e.g. find user by phone) uses **HMAC-SHA256** blind tokens — not full searchable encryption (no substring search on ciphertext).

## Migration

Existing plaintext `phone_number` values: re-save users or run a one-off migration that sets `phone_number_enc` via `encryptField` and unsets `phone_number`.
