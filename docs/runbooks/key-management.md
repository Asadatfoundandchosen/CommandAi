# Key management runbook

**HashiCorp Vault** (application secrets + field encryption keys) and **AWS KMS** (storage CMKs). **Key rotation** and **access audit** are required for production.

## Architecture

| Layer | Technology | Keys |
| ----- | ---------- | ---- |
| **App field encryption** | Vault KV + `FIELD_ENCRYPTION_KEY` | 64-hex AES-256 key in `secret/platform/<env>/encryption` |
| **App envelope (future)** | Vault **transit** or AWS KMS app CMK | `transit/keys/app-field-encryption` / `alias/*-app-encryption` |
| **Storage at rest** | Per-service KMS CMKs | S3, RDS, Atlas, OpenSearch modules |

## AWS KMS — application CMK

Terraform: **`infrastructure/terraform/modules/kms-app-encryption`**

```hcl
resource "aws_kms_key" "app" {
  description         = "1CommandAI application encryption"
  enable_key_rotation = true
  # policy: app role → Decrypt/GenerateDataKey; admin → RotateKeyOnDemand
}
```

Apply per environment:

```bash
cd infrastructure/terraform/environments/key-management
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply
```

### Access pattern (IAM)

| Role | Actions |
| ---- | ------- |
| **App** (`platform-api` IRSA) | `kms:Decrypt`, `kms:Encrypt`, `kms:GenerateDataKey`, `kms:DescribeKey` |
| **Admin** | `kms:RotateKeyOnDemand`, `kms:PutKeyPolicy`, grants |
| **Audit** | CloudTrail `eventSource = kms.amazonaws.com` |

Attach `app_kms_use_policy_arn` output to the API IRSA role.

## HashiCorp Vault — transit

```bash
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=...
./scripts/vault/setup-transit-keys.sh
```

Equivalent manual steps:

```bash
vault secrets enable transit
vault write -f transit/keys/app-field-encryption type=aes256-gcm96 exportable=false
```

### Access pattern (Vault policies)

| Policy | File | Capabilities |
| ------ | ---- | ------------- |
| **App** | `infrastructure/vault/policies/app-transit-policy.hcl` | `transit/encrypt/*`, `transit/decrypt/*`, KV read |
| **Admin** | `infrastructure/vault/policies/admin-transit-policy.hcl` | `transit/keys/*/rotate`, KV write |

### Audit

1. Enable Vault audit device: `vault audit enable file file_path=/vault/logs/audit.log`
2. Ship logs to Loki / SIEM (see `infrastructure/k8s/logging/`)
3. Alert on `policy_name=admin-transit` volume spikes

## FIELD_ENCRYPTION_KEY lifecycle

1. **Generate:** `openssl rand -hex 32`
2. **Store:** `vault kv put secret/platform/prod/encryption field_encryption_key=... kms_key_arn=...`
3. **Inject:** External Secrets → `FIELD_ENCRYPTION_KEY` (`k8s/base/external-secret-field-encryption.example.yaml`)
4. **Rotate:** `scripts/vault/rotate-field-encryption-key.sh prod` then re-encrypt MongoDB `*_enc` fields

Backend reads **`FIELD_ENCRYPTION_KEY`** at startup (`backend/src/config/index.ts`); **required** in staging/prod.

## Key rotation automation

| Key | Method | Schedule |
| --- | ------ | -------- |
| AWS KMS CMK | `enable_key_rotation = true` | Annual (AWS-managed) |
| Vault transit | `scripts/vault/rotate-transit-key.sh` | Quarterly or on incident |
| FIELD_ENCRYPTION_KEY | `rotate-field-encryption-key.sh` + DB migration | Quarterly |
| Reminder | `.github/workflows/key-rotation.yml` | Cron + manual dispatch |

### GitHub Actions

- **Schedule:** quarterly reminder (workflow opens checklist)
- **Manual:** `workflow_dispatch` → `vault-transit-rotate` (needs `VAULT_ADDR`, `VAULT_ROTATION_TOKEN` secrets)

## Verification

```bash
# KMS rotation enabled
aws kms get-key-rotation-status --key-id alias/1commandai-prod-app-encryption

# Vault transit versions
vault read transit/keys/app-field-encryption

# App cannot rotate (expect 403)
vault token create -policy=app-transit -ttl=5m
```

## Incident: compromised key

1. **Rotate** Vault transit + generate new `FIELD_ENCRYPTION_KEY`
2. **Revoke** old Vault KV version / disable KMS grant
3. **Re-encrypt** all `*_enc` MongoDB fields
4. **Review** CloudTrail + Vault audit for `Decrypt` anomalies
5. Document in post-incident report

## Related

- `docs/FIELD-ENCRYPTION.md` — application crypto
- `docs/runbooks/encryption-at-rest.md` — storage CMKs
- `infrastructure/vault/README.md`
