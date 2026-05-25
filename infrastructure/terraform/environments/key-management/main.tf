# Application encryption CMK — apply per environment after EKS IRSA roles exist.
# Sync FIELD_ENCRYPTION_KEY to Vault KV; optional envelope via this CMK later.
# See docs/runbooks/key-management.md

module "app_encryption_kms" {
  source = "../../modules/kms-app-encryption"

  name_prefix = "${var.project_name}-${var.environment}"
  environment = var.environment
  app_role_arns = var.app_role_arns
  admin_role_arns = var.admin_role_arns

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
