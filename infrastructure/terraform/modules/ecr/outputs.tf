output "repository_urls" {
  description = "Repository URLs (registry/repository) for each service."
  value = {
    for name, repo in aws_ecr_repository.service : name => repo.repository_url
  }
}

output "repository_url_api" {
  description = "ECR repository URL for the api image."
  value       = aws_ecr_repository.service["api"].repository_url
}

output "repository_url_worker" {
  description = "ECR repository URL for the worker image."
  value       = aws_ecr_repository.service["worker"].repository_url
}

output "repository_url_frontend" {
  description = "ECR repository URL for the frontend image."
  value       = aws_ecr_repository.service["frontend"].repository_url
}

output "repository_arns" {
  description = "ECR repository ARNs for each service."
  value = {
    for name, repo in aws_ecr_repository.service : name => repo.arn
  }
}

output "eks_nodes_ecr_pull_policy_arn" {
  description = "ARN of the IAM policy granting EKS nodes pull access to these repositories."
  value       = aws_iam_policy.eks_nodes_ecr_pull.arn
}

output "eks_nodes_ecr_pull_policy_name" {
  description = "Name of the IAM policy granting EKS nodes pull access to these repositories."
  value       = aws_iam_policy.eks_nodes_ecr_pull.name
}

output "registry_replication_enabled" {
  description = "True when account-level ECR replication is configured for the name_prefix repository path."
  value       = length(var.replication_destinations) > 0
}

output "registry_replication_registry_id" {
  description = "Registry ID where replication configuration was applied (primary account)."
  value       = try(aws_ecr_replication_configuration.service_prefix[0].registry_id, null)
}
