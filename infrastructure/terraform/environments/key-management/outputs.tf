output "app_kms_key_arn" {
  value       = module.app_encryption_kms.kms_key_arn
  description = "Store in Vault: secret/data/platform/<env>/encryption kms_key_arn"
}

output "app_kms_key_alias" {
  value = module.app_encryption_kms.kms_key_alias
}

output "app_kms_use_policy_arn" {
  value = module.app_encryption_kms.app_kms_use_policy_arn
}

output "admin_kms_manage_policy_arn" {
  value = module.app_encryption_kms.admin_kms_manage_policy_arn
}
