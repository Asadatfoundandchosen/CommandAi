output "atlas_project_id" {
  description = "Atlas project ID"
  value       = mongodbatlas_project.this.id
}

output "cluster_id" {
  value = mongodbatlas_advanced_cluster.this.id
}

output "cloud_backup_schedule_id" {
  description = "Atlas cloud backup policy resource id (see mongodbatlas_cloud_backup_schedule.main)"
  value       = mongodbatlas_cloud_backup_schedule.main.id
}

output "atlas_network_cidr" {
  value       = mongodbatlas_network_container.this.atlas_cidr_block
  description = "CIDR of the Atlas network container (for AWS routes to Atlas)"
}

output "aws_vpc_peering_connection_id" {
  description = "AWS peering ID for aws_vpc_peering_connection_accepter and routes"
  value       = mongodbatlas_network_peering.eks.connection_id
}

output "app_user_name" {
  value = mongodbatlas_database_user.app_user.username
}

output "admin_user_name" {
  value = mongodbatlas_database_user.admin_user.username
}

output "readonly_user_name" {
  value = mongodbatlas_database_user.readonly_user.username
}

output "app_user_password" {
  value     = random_password.app_user.result
  sensitive = true
}

output "admin_user_password" {
  value     = random_password.admin_user.result
  sensitive = true
}

output "readonly_user_password" {
  value     = random_password.readonly_user.result
  sensitive = true
}

output "encryption_at_rest_enabled" {
  value       = var.encryption_at_rest_enabled
  description = "Whether Atlas BYOK (AWS KMS) encryption at rest is configured."
}

output "atlas_kms_key_arn" {
  value       = var.encryption_at_rest_enabled ? local.atlas_kms_key_arn : null
  description = "AWS KMS CMK used for Atlas encryption at rest (per project)."
}

output "atlas_kms_key_alias" {
  value       = var.encryption_at_rest_enabled && var.create_atlas_kms_key ? aws_kms_alias.atlas[0].name : null
  description = "KMS alias for the Atlas project CMK."
}
