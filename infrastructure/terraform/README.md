# 1CommandAI — Terraform

Terraform **1.5+** with the **hashicorp/aws** provider **5.x**. Remote state uses **Amazon S3** with **DynamoDB** locking and **encryption at rest** for the state object.

## Layout

```text
infrastructure/terraform/
├── README.md                 # This file
├── .gitignore
├── bootstrap/
│   └── state-backend/        # One-time: S3 bucket + DynamoDB lock table (local state)
├── modules/                  # Reusable modules (call only from environments/)
│   ├── vpc/
│   ├── security-groups/
│   ├── eks/
│   └── ecr/
└── environments/             # One root module per environment (separate state per env)
    ├── dev/
    ├── staging/
    ├── prod/
    └── dr/
```

Each environment directory is a **standalone root module**: run `terraform init`, `plan`, and `apply` from that directory only.

## Remote state (S3 + DynamoDB)

| Setting | Value |
|--------|--------|
| State bucket | `1commandai-terraform-state` |
| Lock table | `terraform-locks` (partition key **`LockID`**, String) |
| Encryption | `encrypt = true` on the S3 backend (SSE for state objects) |
| State keys | `environments/<env>/terraform.tfstate` (one key per environment) |
| Backend region | `us-east-1` (where the bucket and table live) |

**Bootstrap (once per AWS account that hosts state):** create the bucket and table before the first full `terraform init` in any environment (or apply the included stack):

- **Automated:** `bootstrap/state-backend/` — creates the bucket (encryption, versioning, public access block) and DynamoDB lock table. Uses **local** Terraform state so it does not depend on the bucket existing first. See `bootstrap/state-backend/README.md`.
- **Manual:** S3 with **default encryption**, **block public access**, and (recommended) **versioning**; DynamoDB table `terraform-locks` with **`LockID`** (String) hash key; pay-per-request billing is typical.

If you already use local state for `prod`, the first init with the S3 backend will offer state migration (`terraform init` then follow prompts, or use `-migrate-state`).

**CI / validate without remote state:** from an environment directory, `terraform init -backend=false` then `terraform validate` works without the bucket or DynamoDB table.

**`terraform plan` / `apply`:** require a **fully configured** S3 backend (`terraform init` **without** `-backend=false` after the bucket and lock table exist). If you only run `init -backend=false`, `plan` will error until you re-run `terraform init` and allow backend configuration.

Use `aws_skip_credential_checks = true` in a `terraform.tfvars` only for offline validation where supported (e.g. `prod`).

## Environments

| Directory | Purpose | Default `aws_region` | Notes |
|-----------|---------|----------------------|--------|
| `environments/dev` | Development | `us-east-1` | VPC + security groups |
| `environments/staging` | Pre-production | `us-east-1` | VPC + security groups |
| `environments/prod` | Production | `us-east-1` | VPC + security groups + **EKS** + Helm (autoscaler, metrics-server) |
| `environments/dr` | AWS DR footprint | `us-west-2` | VPC + security groups (override region/AZs in tfvars if DR is elsewhere) |

## Module usage

### `modules/vpc`

Creates a multi-AZ VPC with public and private subnets, Internet Gateway, NAT gateways, and baseline security groups.

**Inputs (high level):** `name_prefix`, `availability_zones`, `tags`.  
**Outputs:** `vpc_id`, `vpc_cidr`, `public_subnet_ids`, `private_subnet_ids`, `nat_gateway_ids`, route tables, `security_group_ids`.

**Example (inside an environment `main.tf`):**

```hcl
module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = "${var.project_name}-${var.environment}"
  availability_zones = var.availability_zones
  tags               = { Environment = var.environment }
}
```

### `modules/security-groups`

Application-tier security groups (web, API, DB, internal) for a given VPC.

**Inputs:** `vpc_id`, `vpc_cidr`, `name_prefix`, `environment`, `project`.  
**Outputs:** `sg_web_id`, `sg_api_id`, `sg_db_id`, `sg_internal_id`, `security_group_ids`.

**Example:**

```hcl
module "security_groups" {
  source = "../../modules/security-groups"

  vpc_id      = module.vpc.vpc_id
  vpc_cidr    = module.vpc.vpc_cidr
  name_prefix = "${var.project_name}-${var.environment}"
  environment = var.environment
  project     = var.project_name
}
```

### `modules/eks`

EKS cluster with managed node groups (see module for full variables). Used from **`environments/prod`** only in this repo; other environments can add the same module when you are ready to pay for control planes.

**Example:**

```hcl
module "eks" {
  source = "../../modules/eks"

  cluster_name = "${var.project_name}-${var.environment}-eks"
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnet_ids
  aws_region   = var.aws_region
  tags         = { Environment = var.environment, Project = var.project_name, ManagedBy = "terraform" }
}
```

### `modules/ecr`

Private ECR repositories for `api`, `worker`, `frontend` with scan-on-push, immutable tags, lifecycle rules, optional cross-account pull/replication, and an IAM policy for node pulls. See `modules/ecr/variables.tf` for inputs.

**Example:**

```hcl
module "ecr" {
  source = "../../modules/ecr"

  name_prefix = var.project_name
  tags        = { Environment = var.environment }

  cross_account_pull_principal_arns = [] # e.g. DR account root or role ARNs
  eks_node_role_names                 = [] # optional: node group role names
  replication_destinations            = [] # optional: registry replication
}
```

## Environment root variables

These inputs are declared in each `environments/<name>/variables.tf` (defaults differ slightly by folder, e.g. `environment` and `dr` region/AZs).

| Variable | Type | Description |
|----------|------|-------------|
| `environment` | string | Name segment for tags and `name_prefix` (default: folder intent — `dev`, `staging`, `prod`, `dr`). |
| `aws_region` | string | AWS region for providers and modules (default `us-west-2` only in `dr`). |
| `project_name` | string | Project tag and naming prefix (default `1commandai`). |
| `availability_zones` | list(string) | Exactly three AZs for the VPC module (must exist in `aws_region`). |
| `aws_skip_credential_checks` | bool | When `true`, skips some AWS API checks on the provider (CI / validate only; default `false`). |

**`prod` only:** root module also wires **Helm** (see `eks.tf`); no extra root variables beyond the table above.

## Module input variables

### `modules/vpc`

| Variable | Type | Required | Default / notes |
|----------|------|----------|-----------------|
| `name_prefix` | string | yes | Prefix for names and tags. |
| `availability_zones` | list(string) | no | Exactly **3** AZs (validated). |
| `vpc_cidr` | string | no | `10.0.0.0/16` |
| `public_subnet_cidrs` | list(string) | no | Three public /24s |
| `private_subnet_cidrs` | list(string) | no | Three private /24s |
| `tags` | map(string) | no | `{}` |

### `modules/security-groups`

| Variable | Type | Required |
|----------|------|----------|
| `vpc_id` | string | yes |
| `vpc_cidr` | string | yes |
| `name_prefix` | string | yes |
| `environment` | string | yes |
| `project` | string | yes |
| `tags` | map(string) | no (`{}`) |

### `modules/eks`

| Variable | Type | Required | Default / notes |
|----------|------|----------|-----------------|
| `cluster_name` | string | yes | — |
| `cluster_version` | string | no | `1.31` |
| `vpc_id` | string | yes | — |
| `subnet_ids` | list(string) | yes | Typically private subnets |
| `aws_region` | string | yes | — |
| `cluster_endpoint_public_access` | bool | no | `true` |
| `tags` | map(string) | no | `{}` |

### `modules/ecr`

| Variable | Type | Required | Default / notes |
|----------|------|----------|-----------------|
| `name_prefix` | string | yes | Repository path prefix |
| `tags` | map(string) | no | `{}` |
| `cross_account_pull_principal_arns` | list(string) | no | `[]` |
| `eks_node_role_names` | list(string) | no | `[]` |
| `lifecycle_tagged_image_retention_count` | number | no | `10` |
| `lifecycle_extra_tag_prefixes` | list(string) | no | `[]` |
| `replication_destinations` | list(object) | no | `[]` — see variable description in `modules/ecr/variables.tf` |

## Outputs (environments)

- **dev / staging / dr:** VPC id, subnet ids, NAT and route tables, security group ids (see each `outputs.tf`).
- **prod:** same as above **plus** EKS endpoint, CA data, kubeconfig, cluster name, OIDC ARN, cluster-autoscaler IRSA role ARN.

Copy **`terraform.tfvars.example`** to **`terraform.tfvars`** (gitignored) to override defaults.

## Acceptance criteria checklist

| Criterion | Status | Notes |
|-----------|--------|--------|
| **`terraform init` in all environments** | Pass after prerequisites | With **S3 + DynamoDB** created (`bootstrap/state-backend` or manual), run `terraform init` from `dev`, `staging`, `prod`, `dr`. `terraform init -backend=false` succeeds without the bucket but **does not** enable `plan`/`apply`. |
| **State in S3 with encryption** | Config + bootstrap | Every `environments/*/versions.tf` uses `encrypt = true`. Bootstrap applies **SSE-S3 (AES256)** on the state bucket. |
| **DynamoDB lock table exists** | Bootstrap / manual | Table name **`terraform-locks`**, hash key **`LockID`**. Created by `bootstrap/state-backend` or manually; referenced by all environment backends. |
| **`terraform plan` in dev / staging / prod** | Pass after full `init` | Requires valid AWS credentials, configured backend, and (for `prod`) provider/plugin install including Helm. |
| **Reusable modules** | Pass | All environments use `source = "../../modules/..."` for **vpc** and **security-groups**; **prod** adds **eks** (and Helm uses EKS outputs). |
| **README documents modules and variables** | Pass | This file: module sections, examples, environment + module variable tables above. |

## Cross-stack references

- **Same repo, another root module:** use `terraform_remote_state` in the consuming stack pointing at the same bucket/key as the producer environment, or pass IDs via CI/CD variables.
- **Within the same root module:** reference `module.vpc.vpc_id`, `module.security_groups.sg_api_id`, etc., as in the examples above.

## Common commands

```bash
cd infrastructure/terraform/environments/prod
terraform init
terraform plan
terraform apply
```

Repeat with `dev`, `staging`, or `dr` as needed.
