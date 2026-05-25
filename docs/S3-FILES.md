# S3 files bucket (documents & exports)

## Design

- **Name:** `1commandai-files-<environment>` (Terraform)
- **Versioning:** enabled (required for cross-region replication)
- **Encryption:** **SSE-KMS** (AES-256, **customer-managed CMK** per primary bucket; bucket default encryption; replica has its own CMK in the DR region). Runbook: **`docs/runbooks/encryption-at-rest.md`**.
- **Access:** private — **block all public access**; HTTPS-only bucket policy (deny insecure transport)
- **CRR:** optional replica `1commandai-files-<env>-dr-<replicaRegionSanitized>` in a second AWS **region** (e.g. `us-west-2` as DR for `us-east-1`)

## Terraform

- **Module:** `infrastructure/terraform/modules/s3-files-bucket/`
- **CRR module:** `infrastructure/terraform/modules/s3-bucket-crr/`
- **Example stack:** `infrastructure/terraform/environments/s3-files/`

```bash
cd infrastructure/terraform/environments/s3-files
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Copy **outputs** `files_bucket_id`, `files_bucket_region`, `api_files_policy_arn` into **Vault** / **Kubernetes** secrets.

## API configuration

| Env var | Example |
|--------|--------|
| `S3_FILES_BUCKET` | `1commandai-files-prod` |
| `S3_FILES_REGION` | `us-east-1` |
| `S3_FILES_KMS_KEY_ARN` | (optional) CMK from Terraform output for SDK — default encryption is bucket-managed |

Joi + `config` surface: `config.s3` in `backend/src/config/index.ts` (empty = feature off).

## Object lifecycle (cost)

Terraform: **`infrastructure/terraform/modules/s3-files-bucket/lifecycle.tf`**

| Prefix | Policy |
|--------|--------|
| **`uploads/`** | Transition to **S3 Glacier** after **90 days**; **expire** objects after **365 days** (1 year). |
| **`audit-exports/`** | **No expiration** for completed exports (keep **forever**). Rule only **aborts incomplete multipart uploads** after 7 days — AWS S3 requires at least one lifecycle action per rule; this does **not** delete finished audit objects. |

**Product copy:** move cold storage after ~90d, delete general uploads after ~1y, retain audit exports without a delete rule.

### Key layout (must match prefixes)

- **General uploads** (presigned API): `uploads/<org_id>/<uuid>/<filename>` — subject to **archive + expiration**.
- **Audit exports** (batch jobs / exports): `audit-exports/<org_id>/…` — **not** expired by lifecycle; use a separate writer (or extend the API) under this prefix.

## Presigned URLs (direct client upload/download)

- **`POST /api/files/presign-upload`** — body `{ filename, contentType, contentLengthBytes }`; tenant **`x-org-id`** or **`org_id`**. Returns `{ url, key }` where **key** is `uploads/<org_id>/<uuid>/<filename>`. **TTL 15 minutes**; **Content-Type** must be on the server **whitelist**; **size** must be **≤ 100 MiB** (declared `ContentLength` is part of the signature).
- **`POST /api/files/presign-download`** — body `{ key }`; key must be under **`uploads/<org_id>/`** or **`audit-exports/<org_id>/`** for the resolved tenant.
- **Audit:** each successful presign writes an **OpenSearch** audit event (`files.presigned_upload_url` / `files.presigned_download_url`) when audit is configured; failures are logged only.

Implementation: **`backend/src/modules/files/file.service.ts`** (AWS SDK v3 **`getSignedUrl`**).

## IAM

- Policy **`1commandai-api-files-<env>`** — attach to the **EKS** pod **IRSA** role or the compute role that calls S3. **Not** the CRR service role (that is only for S3’s replication engine).

## Monitoring

- **S3** metrics: `AllRequests`, `4xx/5xx`, `ReplicationLatency` (if CRR) in **CloudWatch**
- **KMS** usage: key metrics for encrypt/decrypt errors

## Grafana — storage / cost dashboard

- Import **`infrastructure/k8s/monitoring/grafana/dashboards/s3-files-storage-costs.json`** (markdown runbook + CloudWatch metric table). Add **CloudWatch** panels for `BucketSizeBytes` / `NumberOfObjects` once the datasource is configured in your Grafana stack.
