output "domain_endpoint" {
  value       = aws_opensearch_domain.this.endpoint
  description = "VPC **HTTPS** endpoint (hostname) for `https://` + `OPENSEARCH_NODE`."
}

output "domain_arn" {
  value       = aws_opensearch_domain.this.arn
  description = "Domain ARN for IAM policy `Resource`."
}

output "dashboard_endpoint" {
  value       = aws_opensearch_domain.this.dashboard_endpoint
  description = "OpenSearch Dashboards URL."
}

output "master_user_password" {
  value = (
    length(random_password.master) > 0 ? random_password.master[0].result : null
  )
  sensitive   = true
  description = "Built-in master password when `enable_internal_user_database` is true — store in Vault and rotate."
}
