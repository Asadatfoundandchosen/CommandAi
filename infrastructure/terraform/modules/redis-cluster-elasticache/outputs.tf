output "security_group_id" {
  value       = aws_security_group.redis.id
  description = "Security group for ElastiCache (attach only API/EKS client SG to ingress 6379)"
}

output "configuration_endpoint_address" {
  value       = aws_elasticache_replication_group.this.configuration_endpoint_address
  description = "Configuration endpoint (cluster mode) for ioredis.Cluster + rediss://"
}

output "primary_endpoint_address" {
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
  description = "Primary reader endpoint (varies by engine; prefer configuration endpoint for cluster mode)"
}

output "port" {
  value = aws_elasticache_replication_group.this.port
}

output "replication_group_id" {
  value = aws_elasticache_replication_group.this.id
}

output "auth_token" {
  value       = random_password.auth_token.result
  sensitive   = true
  description = "Store in HashiCorp Vault; never commit. Example path: secret/data/infra/redis/elasticache"
}

