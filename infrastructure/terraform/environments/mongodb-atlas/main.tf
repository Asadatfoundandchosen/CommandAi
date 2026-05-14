# Apply from this directory to create the Atlas M30+ cluster, VPC peering, and AWS routes to Atlas.
# Copy database passwords from Terraform state (sensitive) or `terraform output -json` and store in HashiCorp Vault
# (KV v2 recommended: path e.g. secret/databases/mongodb/1commandai) — do not commit secrets to git.
data "aws_caller_identity" "current" {}

module "atlas" {
  source = "../../modules/mongodb-atlas"

  atlas_org_id         = var.atlas_org_id
  atlas_project_name   = var.atlas_project_name
  cluster_name         = "app-main"
  mongo_db_major_version = "7.0"
  instance_size        = "M30"
  app_database_name    = "app_db"

  atlas_cidr_for_network_container = var.atlas_container_cidr
  eks_vpc_id                       = var.eks_vpc_id
  eks_vpc_cidr                     = var.eks_vpc_cidr
  aws_account_id                   = data.aws_caller_identity.current.account_id
}

resource "aws_vpc_peering_connection_accepter" "atlas" {
  vpc_peering_connection_id = module.atlas.aws_vpc_peering_connection_id
  auto_accept               = true
}

resource "aws_route" "private_to_atlas" {
  for_each = toset(var.private_route_table_ids)

  route_table_id            = each.value
  destination_cidr_block    = module.atlas.atlas_network_cidr
  vpc_peering_connection_id = aws_vpc_peering_connection_accepter.atlas.id

  depends_on = [aws_vpc_peering_connection_accepter.atlas]
}
