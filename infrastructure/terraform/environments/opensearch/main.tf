# Amazon OpenSearch Service — see `docs/OPENSEARCH.md`. Copy outputs + password to Vault.

module "opensearch" {
  source = "../../modules/opensearch-domain"

  domain_name                    = var.domain_name
  vpc_id                         = var.vpc_id
  private_subnet_ids             = var.private_subnet_ids
  allowed_security_group_ids     = var.allowed_security_group_ids
  opensearch_access_principal_arns = var.opensearch_access_principal_arns
  warm_enabled                   = var.warm_enabled

  tags = {
    Environment = "shared"
    Project     = "1commandai"
  }
}
