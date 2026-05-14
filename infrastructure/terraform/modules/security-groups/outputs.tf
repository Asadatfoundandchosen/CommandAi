output "sg_web_id" {
  description = "Security group ID for web tier (80, 443)"
  value       = aws_security_group.web.id
}

output "sg_api_id" {
  description = "Security group ID for API tier (3000 from web)"
  value       = aws_security_group.api.id
}

output "sg_db_id" {
  description = "Security group ID for data tier (DB ports from API)"
  value       = aws_security_group.db.id
}

output "sg_internal_id" {
  description = "Security group ID for full intra-VPC traffic"
  value       = aws_security_group.internal.id
}

output "security_group_ids" {
  description = "Map of logical name to security group ID"
  value = {
    web      = aws_security_group.web.id
    api      = aws_security_group.api.id
    db       = aws_security_group.db.id
    internal = aws_security_group.internal.id
  }
}
