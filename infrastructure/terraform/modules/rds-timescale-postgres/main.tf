# RDS PostgreSQL 15 with TimescaleDB extension support (custom parameter group).
# Credentials: write `random_password.master` and connection URL to **HashiCorp Vault** (or External Secrets)
# after apply — see `docs/TIMESCALE.md`. Do not commit secrets to git.

locals {
  base_id = replace(lower(var.name_prefix), "/[^a-z0-9-]+/", "-")
}

resource "random_id" "suffix" {
  byte_length = 2
}

resource "random_password" "master" {
  length           = 32
  special          = true
  # RDS master password must not include / " @ or space
  override_special = "!#$%&*()-_=+[]{}<>?:"
}

resource "aws_security_group" "postgres" {
  name_prefix = "${local.base_id}-ts-pg-"
  description = "PostgreSQL 15 / TimescaleDB — 5432 from allowed SGs only"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.allowed_security_group_ids
    content {
      description     = "PostgreSQL from allowed SG"
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    description = "Egress (AWS requirement)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    { Name = "${var.name_prefix}-sg-rds-timescale" },
    var.tags,
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_subnet_group" "this" {
  name       = substr("${local.base_id}-sub-${random_id.suffix.hex}", 0, 255)
  subnet_ids = var.private_subnet_ids

  tags = merge(
    { Name = "${var.name_prefix}-db-subnet-timescale" },
    var.tags,
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_parameter_group" "timescale" {
  count = var.timescaledb_shared_preload ? 1 : 0

  name        = substr("${local.base_id}-pg15-ts-${random_id.suffix.hex}", 0, 255)
  family      = "postgres15"
  description = "PostgreSQL 15 + TimescaleDB preload for 1CommandAI"

  parameter {
    name         = "shared_preload_libraries"
    value        = "timescaledb"
    apply_method = "pending-reboot"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier     = substr("${local.base_id}-ts-${random_id.suffix.hex}", 0, 63)
  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.database_name
  username = var.master_username
  password = random_password.master.result

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = min(var.allocated_storage_gb * 2, 1000)
  storage_type          = "gp3"
  storage_encrypted     = var.storage_encrypted
  kms_key_id            = local.rds_kms_key_id

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  parameter_group_name   = var.timescaledb_shared_preload ? aws_db_parameter_group.timescale[0].name : null

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${local.base_id}-timescale-final-${random_id.suffix.hex}"

  publicly_accessible = false
  copy_tags_to_snapshot = true

  tags = merge(
    {
      Name        = "${var.name_prefix}-rds-timescale"
      Application = "1commandai-metrics"
    },
    var.tags,
  )

  lifecycle {
    ignore_changes = [password]
  }
}
