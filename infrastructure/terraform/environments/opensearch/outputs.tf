output "domain_endpoint" {
  value = module.opensearch.domain_endpoint
}

output "domain_arn" {
  value = module.opensearch.domain_arn
}

output "master_user_password" {
  value     = module.opensearch.master_user_password
  sensitive = true
}
