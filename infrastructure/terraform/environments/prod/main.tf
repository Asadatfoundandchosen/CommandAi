module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = "${var.project_name}-${var.environment}"
  availability_zones = var.availability_zones
  tags = {
    Environment = var.environment
  }
}

module "security_groups" {
  source = "../../modules/security-groups"

  vpc_id      = module.vpc.vpc_id
  vpc_cidr    = module.vpc.vpc_cidr
  name_prefix = "${var.project_name}-${var.environment}"
  environment = var.environment
  project     = var.project_name
}
