output "atlas_project_id" {
  value = module.atlas.atlas_project_id
}

output "atlas_network_cidr" {
  value = module.atlas.atlas_network_cidr
}

# Store these values (and the sensitive password outputs) in HashiCorp Vault; reference from External Secrets in Kubernetes.
output "app_user_name" {
  value = module.atlas.app_user_name
}

output "app_user_password" {
  value     = module.atlas.app_user_password
  sensitive = true
}

output "admin_user_password" {
  value     = module.atlas.admin_user_password
  sensitive = true
}

output "readonly_user_password" {
  value     = module.atlas.readonly_user_password
  sensitive = true
}

output "atlas_encryption_at_rest_enabled" {
  value       = module.atlas.encryption_at_rest_enabled
  description = "Atlas BYOK (AWS KMS) encryption at rest."
}

output "atlas_kms_key_arn" {
  value       = module.atlas.atlas_kms_key_arn
  description = "Per-project CMK for MongoDB Atlas encryption at rest."
}
