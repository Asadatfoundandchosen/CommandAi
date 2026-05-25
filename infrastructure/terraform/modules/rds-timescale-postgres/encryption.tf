# RDS PostgreSQL / TimescaleDB — **storage encryption** (AES-256) with optional **AWS KMS CMK**.

data "aws_caller_identity" "rds" {
  count = var.create_dedicated_kms_key ? 1 : 0
}

resource "aws_kms_key" "rds" {
  count = var.create_dedicated_kms_key ? 1 : 0

  description             = "RDS Timescale ${var.name_prefix}"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableAccountUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.rds[0].account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowRDSService"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey",
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.name_prefix}-rds-timescale" })
}

resource "aws_kms_alias" "rds" {
  count = var.create_dedicated_kms_key ? 1 : 0

  name          = "alias/1commandai-rds-${replace(local.base_id, "/[^a-z0-9-]+/", "-")}"
  target_key_id = aws_kms_key.rds[0].key_id
}

locals {
  rds_kms_key_id = var.storage_encrypted ? (
    var.kms_key_id != null ? var.kms_key_id : (
      var.create_dedicated_kms_key ? aws_kms_key.rds[0].arn : null
    )
  ) : null
}
