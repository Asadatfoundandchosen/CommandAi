output "bucket_id" {
  value       = aws_s3_bucket.files.id
  description = "S3 bucket name (use in `S3_FILES_BUCKET` or `FILES_S3_BUCKET` app env)"
}

output "bucket_arn" {
  value       = aws_s3_bucket.files.arn
  description = "Bucket ARN"
}

output "bucket_region" {
  value       = data.aws_region.current.id
  description = "Region where the primary bucket lives (set `S3_FILES_REGION` for AWS SDK)"
}

output "kms_key_arn" {
  value       = aws_kms_key.files.arn
  description = "KMS key for bucket default encryption; API policy includes usage"
}

output "kms_key_id" {
  value       = aws_kms_key.files.id
  description = "KMS key id (for CRR `aws_kms_grant` / `source_kms_key_id`)"
}

output "kms_key_alias" {
  value       = aws_kms_alias.files.name
  description = "KMS alias for operations / auditing"
}

output "api_files_policy_arn" {
  value       = aws_iam_policy.api_files_access.arn
  description = "Attach to EKS pod role, EC2, or CI that runs the API"
}
