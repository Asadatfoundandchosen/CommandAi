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
