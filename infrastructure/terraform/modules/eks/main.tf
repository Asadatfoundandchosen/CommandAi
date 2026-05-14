# Managed node group IAM roles are registered in the aws-auth ConfigMap by EKS.
# IRSA uses the cluster OIDC provider (enable_irsa). User/CI RBAC: EKS access entries or aws-auth mapRoles.
module "cluster" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.31"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  cluster_endpoint_public_access  = var.cluster_endpoint_public_access
  cluster_endpoint_private_access = true

  authentication_mode                      = "API_AND_CONFIG_MAP"
  enable_cluster_creator_admin_permissions = true

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  enable_irsa = true

  eks_managed_node_groups = {
    general = {
      name           = "general"
      instance_types = ["t3.large"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
      labels = {
        workload = "general"
      }
      tags = merge(var.tags, { NodeGroup = "general" })
    }
    memory = {
      name           = "memory"
      instance_types = ["r5.large"]
      min_size       = 1
      max_size       = 5
      desired_size   = 1
      labels = {
        workload = "memory"
      }
      tags = merge(var.tags, { NodeGroup = "memory" })
    }
  }

  tags = var.tags
}

# IAM role for cluster-autoscaler (IRSA); OIDC is created by the EKS module above.
module "cluster_autoscaler_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name                        = "${var.cluster_name}-cluster-autoscaler"
  attach_cluster_autoscaler_policy = true
  cluster_autoscaler_cluster_names = [module.cluster.cluster_name]

  oidc_providers = {
    main = {
      provider_arn               = module.cluster.oidc_provider_arn
      namespace_service_accounts = ["kube-system:cluster-autoscaler"]
    }
  }

  tags = var.tags

  depends_on = [module.cluster]
}
