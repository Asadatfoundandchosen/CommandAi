# Example stack: RDS PostgreSQL 15 + TimescaleDB (see module README in `modules/rds-timescale-postgres`).
# Apply from this directory after setting `terraform.tfvars` (VPC + subnets + SGs).
# Store `terraform output -raw master_password` and endpoint in **Vault** — see `docs/TIMESCALE.md`.

module "timescale_rds" {
  source = "../../modules/rds-timescale-postgres"

  name_prefix                  = var.project_name
  vpc_id                       = var.vpc_id
  private_subnet_ids           = var.private_subnet_ids
  allowed_security_group_ids   = var.allowed_security_group_ids
  skip_final_snapshot          = var.skip_final_snapshot
  deletion_protection          = var.deletion_protection
  instance_class               = "db.r6g.large"
  multi_az                     = true
  storage_encrypted            = true
  create_dedicated_kms_key     = true
  timescaledb_shared_preload   = true

  tags = {
    Environment = "shared"
    Project     = var.project_name
  }
}
