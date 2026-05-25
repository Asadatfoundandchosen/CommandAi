# Encryption at rest — security runbook

Platform standard: **AES-256** encryption at rest on all persistent data stores. **Customer-managed keys (CMK)** via **AWS KMS** where the service supports BYOK. **ElastiCache Redis** uses **AWS-managed** at-rest keys (no CMK option). **Optional per-tenant CMK** is an enterprise add-on (separate Atlas project or dedicated KMS alias per `org_id`).

## Summary matrix

| Store | Algorithm | Key management | Terraform / config |
| ----- | --------- | -------------- | ------------------ |
| **MongoDB Atlas** | AES-256 | **CMK per Atlas project** (AWS KMS) | `modules/mongodb-atlas/encryption.tf` |
| **ElastiCache Redis** | AES-256 | **AWS-managed** (at-rest + in-transit) | `modules/redis-cluster-elasticache` — `at_rest_encryption_enabled = true` |
| **S3 (files)** | AES-256 | **CMK** (SSE-KMS, bucket default) | `modules/s3-files-bucket` |
| **RDS / TimescaleDB** | AES-256 | **CMK** (dedicated key) | `modules/rds-timescale-postgres/encryption.tf` |
| **OpenSearch** | AES-256 | **CMK** (domain encryption) | `modules/opensearch-domain/encryption.tf` |
| **Terraform state** | AES-256 | SSE-S3 on state bucket | `bootstrap/state-backend` |

## 1. MongoDB Atlas

### Settings

- **Encryption at rest:** enabled on the Atlas **project** via `mongodbatlas_encryption_at_rest`.
- **KMS:** **AWS KMS** customer master key (CMK), one key **per Atlas project** (default).
- **IAM:** Atlas cloud provider access — setup → IAM role → authorization → KMS grant (see `encryption.tf`).

### Verify (Atlas UI)

1. Atlas → **Project** → **Security** → **Encryption at Rest**.
2. Provider: **AWS**, status **Enabled**, CMK ARN matches Terraform output `atlas_kms_key_arn`.

### Verify (Terraform)

```bash
cd infrastructure/terraform/environments/mongodb-atlas
terraform output atlas_encryption_at_rest_enabled
terraform output atlas_kms_key_arn
```

### Apply / change key

1. Plan from `environments/mongodb-atlas` (module variables: `encryption_at_rest_enabled`, `create_atlas_kms_key`, `atlas_kms_key_arn`).
2. **Do not** disable encryption by setting `enabled = false` on an existing project without a migration plan — Atlas may enter an inconsistent state.
3. Key rotation: enable **`enable_key_rotation`** on the CMK (default in module); Atlas re-wraps master keys automatically.

### Optional per-tenant key

For a single enterprise org requiring its own CMK:

- Provision a **dedicated Atlas project** (or cluster) and CMK, or
- Store `kms_key_arn` in **`org_settings`** and route that org’s data to the dedicated project (application / ops process — not default multi-tenant path).

## 2. Redis (ElastiCache)

### Settings

- **`at_rest_encryption_enabled = true`** — AES-256, **AWS-owned / AWS-managed** key material.
- **`transit_encryption_enabled = true`** — use **`rediss://`** in `REDIS_URL`.

### Verify (AWS CLI)

```bash
aws elasticache describe-replication-groups \
  --replication-group-id <id> \
  --query 'ReplicationGroups[0].AtRestEncryptionEnabled'
```

Expected: `true`.

### Notes

- ElastiCache **does not** support customer-managed KMS for at-rest encryption; CMK is **not** available for this service.

## 3. S3 (application files)

### Settings

- **Default encryption:** **SSE-KMS** (`aws:kms`) on the bucket.
- **CMK:** dedicated key per primary bucket (`aws_kms_key.files`).
- **Bucket key:** enabled (`bucket_key_enabled = true`) to reduce KMS API cost.
- **CRR:** replica bucket uses a **separate CMK** in the DR region (`s3-bucket-crr`).

### Verify

```bash
aws s3api get-bucket-encryption --bucket <bucket-name>
aws kms describe-key --key-id alias/1commandai-files-<env>
```

See **`docs/S3-FILES.md`**.

## 4. PostgreSQL / TimescaleDB (RDS)

### Settings

- **`storage_encrypted = true`**
- **`kms_key_id`:** dedicated CMK when `create_dedicated_kms_key = true` (default in `environments/timescale-rds`).
- **Multi-AZ:** enabled in production stacks.

### Verify

```bash
aws rds describe-db-instances \
  --db-instance-identifier <id> \
  --query 'DBInstances[0].[StorageEncrypted,KmsKeyId]'
```

Snapshots inherit encryption; final snapshots use the same KMS key.

See **`docs/TIMESCALE.md`**.

## 5. OpenSearch / Elasticsearch

### Settings

- **`encrypt_at_rest.enabled = true`**
- **`kms_key_id`:** CMK when `create_dedicated_kms_key = true`
- **`node_to_node_encryption`:** enabled
- **`enforce_https`:** TLS 1.2+

### Verify

```bash
aws opensearch describe-domain --domain-name <name> \
  --query 'DomainStatus.EncryptionAtRestOptions'
```

See **`docs/OPENSEARCH.md`**.

## KMS operations (all CMKs)

| Task | Action |
| ---- | ------ |
| **Audit** | CloudTrail `kms.amazonaws.com`; alias naming `alias/1commandai-*` |
| **Rotation** | Automatic annual rotation enabled on module-created keys |
| **Access** | Least-privilege IAM; Atlas/RDS/OpenSearch service principals in key policies |
| **Revoke / delete** | **30-day** deletion window; coordinate with data store owner first |

## Incident: encryption misconfiguration

1. **Alert:** Atlas “Encryption at Rest” invalid, RDS/OpenSearch create failure, or S3 `AccessDenied` on `kms:Decrypt`.
2. **Check** key policy includes the service role (Atlas IAM role, `rds.amazonaws.com`, `es.amazonaws.com`, S3 via `kms:ViaService`).
3. **Check** CMK in the **same region** as the resource (Atlas `region` = `US_EAST_1` etc.).
4. **Escalate** to security + platform; do not delete CMKs while clusters are online.

## Related

- **In transit:** VPC peering / private subnets, TLS on Redis and OpenSearch, HTTPS API.
- **Application secrets:** Vault — not stored in Terraform state long-term except initial bootstrap outputs.
- **Field-level encryption:** sensitive PII/credentials in MongoDB (application layer) — see SECURITY RULES in SYSTEM-PROMPT.
