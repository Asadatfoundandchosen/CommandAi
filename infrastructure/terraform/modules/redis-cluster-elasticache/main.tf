# ElastiCache for Redis — cluster mode: 3 shards, 1 replica per shard = 6 nodes (3 primary + 3 read replica).
# Connection string (configuration endpoint) and `auth_token` are written to **Vault** after apply
# (see `docs/REDIS-ELASTICACHE.md`).

locals {
  # replication_group_id: 1–40 chars, [a-z0-9-] only; avoid empty
  base_id              = replace(lower(var.name_prefix), "/[^a-z0-9-]+/", "-")
  replication_group_id = length(local.base_id) > 0 ? substr(local.base_id, 0, 32) : "platform-redis"
}

# AWS provider 5+ requires `name` (not `name_prefix`) on these resources.
resource "random_id" "cache" {
  byte_length = 2
}

locals {
  subnet_group_name  = "${local.replication_group_id}-sub-${random_id.cache.hex}"
  param_group_name   = "${local.replication_group_id}-pg-${random_id.cache.hex}"
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.name_prefix}-elasticache-redis-"
  description = "ElastiCache Redis: 6379 from API security group only"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis (TLS) from API tier"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.api_security_group_id]
  }

  egress {
    description = "Egress (AWS requirement)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    { Name = "${var.name_prefix}-sg-elasticache-redis" },
    var.tags,
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name        = local.subnet_group_name
  subnet_ids  = var.private_subnet_ids

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_elasticache_parameter_group" "this" {
  name                = local.param_group_name
  family              = "redis7"
  description         = "Redis 7+ for 1CommandAI"

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# Auth token: printable ASCII, must not include "/", '"', "@" (AWS).
resource "random_password" "auth_token" {
  length  = 32
  special = false
}

# Cluster-mode replication group: num_node_groups = shard count, replicas = read copies per primary.
resource "aws_elasticache_replication_group" "this" {
  replication_group_id         = local.replication_group_id
  description                    = "Redis 7+ cluster (caching / sessions / BullMQ)"
  node_type                      = var.node_type
  num_node_groups                = var.num_shards
  replicas_per_node_group        = var.replicas_per_node_group
  port                           = 6379
  parameter_group_name         = aws_elasticache_parameter_group.this.name
  engine                         = "redis"
  engine_version                 = var.engine_version
  subnet_group_name            = aws_elasticache_subnet_group.this.name
  security_group_ids             = [aws_security_group.redis.id]
  automatic_failover_enabled     = true
  multi_az_enabled               = true
  at_rest_encryption_enabled     = true
  transit_encryption_enabled     = true
  auth_token                     = random_password.auth_token.result
  maintenance_window             = "sun:05:00-sun:06:00"
  apply_immediately              = var.apply_immediately
  auto_minor_version_upgrade = true
  tags                      = var.tags
}
