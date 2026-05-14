output "vpc_id" {
  description = "VPC ID (AWS prod)"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnet_ids
}

output "security_group_ids" {
  description = "VPC baseline security group IDs (from vpc module)"
  value       = module.vpc.security_group_ids
}

output "sg_web_id" {
  description = "Web tier security group ID (80, 443)"
  value       = module.security_groups.sg_web_id
}

output "sg_api_id" {
  description = "API tier security group ID (3000 from web)"
  value       = module.security_groups.sg_api_id
}

output "sg_db_id" {
  description = "Database tier security group ID (ports from API only; attach DBs in private subnets)"
  value       = module.security_groups.sg_db_id
}

output "sg_internal_id" {
  description = "Internal mesh security group ID (full traffic within VPC CIDR)"
  value       = module.security_groups.sg_internal_id
}

output "application_security_group_ids" {
  description = "Map of application security group names to IDs"
  value       = module.security_groups.security_group_ids
}

output "nat_gateway_ids" {
  description = "NAT Gateway IDs"
  value       = module.vpc.nat_gateway_ids
}

output "public_route_table_id" {
  description = "Public route table ID (0.0.0.0/0 → IGW)"
  value       = module.vpc.public_route_table_id
}

output "private_route_table_ids" {
  description = "Private route table IDs (0.0.0.0/0 → NAT per AZ)"
  value       = module.vpc.private_route_table_ids
}

output "eks_cluster_endpoint" {
  description = "EKS Kubernetes API endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_certificate_authority_data" {
  description = "EKS cluster CA data (base64)"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_kubeconfig" {
  description = "Kubeconfig YAML using aws eks get-token (exec)"
  value       = module.eks.kubeconfig
  sensitive   = true
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_oidc_provider_arn" {
  description = "EKS OIDC provider ARN (IRSA)"
  value       = module.eks.oidc_provider_arn
}

output "eks_cluster_autoscaler_irsa_role_arn" {
  description = "IAM role ARN for cluster-autoscaler service account"
  value       = module.eks.cluster_autoscaler_irsa_role_arn
}
