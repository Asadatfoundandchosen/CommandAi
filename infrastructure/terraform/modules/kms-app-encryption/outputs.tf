output "kms_key_arn" {
  value       = aws_kms_key.app.arn
  description = "Application encryption CMK ARN (CloudTrail: kms.amazonaws.com)."
}

output "kms_key_id" {
  value       = aws_kms_key.app.id
  description = "CMK id."
}

output "kms_key_alias" {
  value       = aws_kms_alias.app.name
  description = "Alias for operations and External Secrets references."
}

output "app_kms_use_policy_arn" {
  value       = aws_iam_policy.app_kms_use.arn
  description = "Attach to the platform-api IRSA / EC2 app role."
}

output "admin_kms_manage_policy_arn" {
  value       = length(var.admin_role_arns) > 0 ? aws_iam_policy.admin_kms_manage[0].arn : null
  description = "Attach to security / platform admin roles."
}
