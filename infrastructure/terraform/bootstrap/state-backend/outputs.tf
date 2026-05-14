output "state_bucket_id" {
  description = "S3 bucket id holding Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.terraform_state.arn
}

output "lock_table_name" {
  description = "DynamoDB table used for state locking"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "lock_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.terraform_locks.arn
}
