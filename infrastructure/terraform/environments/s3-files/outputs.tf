output "files_bucket_id" {
  value       = module.files.bucket_id
  description = "Set S3_FILES_BUCKET in the API (and document in Vault)"
}

output "files_bucket_region" {
  value       = module.files.bucket_region
  description = "Set S3_FILES_REGION"
}

output "files_kms_key_arn" {
  value       = module.files.kms_key_arn
  description = "Set S3_FILES_KMS_KEY_ARN for clients that need explicit CMK (optional)"
}

output "api_files_policy_arn" {
  value       = module.files.api_files_policy_arn
  description = "Attach to the API task role (EKS) or workload IAM user"
}

output "replica_bucket_id" {
  value       = module.crr.replica_bucket_id
  description = "DR bucket (if CRR enabled)"
}
