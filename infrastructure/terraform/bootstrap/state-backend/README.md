# Terraform remote state backend (bootstrap)

Apply **once per AWS account** (with **local** Terraform state) to create the shared **S3** bucket and **DynamoDB** lock table referenced by `environments/*/versions.tf`.

After this succeeds, run `terraform init` (without `-backend=false`) from each environment directory so state migrates to S3 and plans can acquire locks.

**Prerequisites:** AWS credentials for the account; the S3 bucket name must be globally unique (change `bucket_name` if `1commandai-terraform-state` is taken).

```bash
cd infrastructure/terraform/bootstrap/state-backend
terraform init
terraform plan
terraform apply
```
