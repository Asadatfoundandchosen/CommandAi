module "eks" {
  source = "../../modules/eks"

  cluster_name = "${var.project_name}-${var.environment}-eks"
  vpc_id       = module.vpc.vpc_id
  subnet_ids   = module.vpc.private_subnet_ids
  aws_region   = var.aws_region

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  depends_on = [module.vpc]
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args = [
        "eks", "get-token",
        "--cluster-name", module.eks.cluster_name,
        "--region", var.aws_region
      ]
    }
  }
}

resource "helm_release" "cluster_autoscaler" {
  name       = "cluster-autoscaler"
  repository = "https://kubernetes.github.io/autoscaler"
  chart      = "cluster-autoscaler"
  namespace  = "kube-system"
  version    = "9.46.2"

  values = [yamlencode({
    autoDiscovery = {
      clusterName = module.eks.cluster_name
      enabled     = true
    }
    awsRegion = var.aws_region
    rbac = {
      serviceAccount = {
        create = true
        name   = "cluster-autoscaler"
        annotations = {
          "eks.amazonaws.com/role-arn" = module.eks.cluster_autoscaler_irsa_role_arn
        }
      }
    }
    extraArgs = {
      "balance-similar-node-groups" = "true"
    }
  })]

  depends_on = [module.eks]
}

resource "helm_release" "metrics_server" {
  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  namespace  = "kube-system"
  version    = "3.12.2"

  values = [yamlencode({
    args = ["--kubelet-insecure-tls"]
  })]

  depends_on = [module.eks]
}
