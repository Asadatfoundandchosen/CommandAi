output "cluster_name" {
  description = "EKS cluster name"
  value       = module.cluster.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API server endpoint"
  value       = module.cluster.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded cluster CA certificate (as returned by the EKS API)"
  value       = module.cluster.cluster_certificate_authority_data
  sensitive   = true
}

output "cluster_oidc_issuer_url" {
  description = "OIDC issuer URL for IRSA"
  value       = module.cluster.cluster_oidc_issuer_url
}

output "oidc_provider_arn" {
  description = "IAM OIDC provider ARN for the cluster"
  value       = module.cluster.oidc_provider_arn
}

output "cluster_autoscaler_irsa_role_arn" {
  description = "IAM role ARN for cluster-autoscaler (IRSA)"
  value       = module.cluster_autoscaler_irsa.iam_role_arn
}

output "kubeconfig" {
  description = "Kubeconfig snippet using aws eks get-token (exec)"
  value = templatefile("${path.module}/templates/kubeconfig.tpl", {
    cluster_name     = module.cluster.cluster_name
    cluster_endpoint = module.cluster.cluster_endpoint
    cluster_ca_data  = module.cluster.cluster_certificate_authority_data
    aws_region       = var.aws_region
  })
  sensitive = true
}
