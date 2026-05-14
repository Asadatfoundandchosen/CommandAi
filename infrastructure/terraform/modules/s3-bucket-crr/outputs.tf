output "replica_bucket_id" {
  value       = var.replication_enabled ? aws_s3_bucket.replica[0].id : null
  description = "DR bucket name (if replication enabled)"
}

output "replica_bucket_arn" {
  value       = var.replication_enabled ? aws_s3_bucket.replica[0].arn : null
  description = "DR bucket ARN"
}

output "replication_role_arn" {
  value       = var.replication_enabled ? aws_iam_role.replication[0].arn : null
  description = "S3 CRR service role (source account)"
}

output "replica_kms_key_arn" {
  value       = var.replication_enabled ? aws_kms_key.replica[0].arn : null
  description = "KMS key on the DR bucket for replicated objects"
}
