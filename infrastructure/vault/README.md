# HashiCorp Vault — key management

Platform secrets and **encryption keys** live in **Vault** (primary for app field encryption) with **AWS KMS** CMKs for **at-rest** storage encryption (S3, RDS, Atlas, etc.).

## Transit engine (application crypto)

```bash
# One-time per cluster (requires admin token)
./scripts/vault/setup-transit-keys.sh
```

Creates:

| Path | Purpose |
| ---- | ------- |
| `transit/keys/app-field-encryption` | AES-256-GCM96 for envelope / future app crypto |
| `transit/keys/app-search-index` | HMAC for searchable blind indexes (optional) |

## Access patterns

| Role | Vault policy | Capabilities |
| ---- | ------------- | ------------ |
| **App** (`platform-api`) | `app-transit-policy.hcl` | `encrypt`, `decrypt`, `read` on `app-field-encryption` only |
| **Admin** (security) | `admin-transit-policy.hcl` | `create`, `rotate`, `config`, `keys/*` on transit keys |

Apply policies:

```bash
vault policy write app-transit policies/app-transit-policy.hcl
vault policy write admin-transit policies/admin-transit-policy.hcl
```

Bind to Kubernetes auth:

```bash
vault write auth/kubernetes/role/platform-api \
  bound_service_account_names=platform-api \
  bound_service_account_namespaces=1commandai-apps \
  policies=app-transit \
  ttl=1h
```

## KV secrets (FIELD_ENCRYPTION_KEY)

Store the 64-hex application key (generated offline or from rotation script):

```bash
vault kv put secret/platform/prod/encryption \
  field_encryption_key="$(openssl rand -hex 32)" \
  kms_key_arn="arn:aws:kms:us-east-1:ACCOUNT:key/UUID"
```

Sync to pods via **External Secrets** — `k8s/base/external-secret-field-encryption.example.yaml`.

## Audit

- Enable **Vault audit devices** (`file` or `socket`) on all production clusters.
- AWS **CloudTrail** records `kms:*` for the application CMK (Terraform module `kms-app-encryption`).

## Rotation

| Key | Automation |
| --- | ---------- |
| **AWS KMS CMK** | `enable_key_rotation = true` (annual) in Terraform |
| **Vault transit** | `scripts/vault/rotate-transit-key.sh` or `.github/workflows/key-rotation.yml` |
| **FIELD_ENCRYPTION_KEY** | Quarterly workflow + `scripts/vault/rotate-field-encryption-key.sh` (re-encrypt MongoDB fields) |

See **`docs/runbooks/key-management.md`**.
