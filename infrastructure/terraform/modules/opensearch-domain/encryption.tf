# OpenSearch domain — **encryption at rest** (AES-256) with **AWS KMS CMK**.

data "aws_caller_identity" "opensearch" {
  count = var.create_dedicated_kms_key ? 1 : 0
}

resource "aws_kms_key" "opensearch" {
  count = var.create_dedicated_kms_key ? 1 : 0

  description             = "OpenSearch ${var.domain_name}"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableAccountUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.opensearch[0].account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowOpenSearchService"
        Effect = "Allow"
        Principal = {
          Service = "es.amazonaws.com"
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

  tags = merge(var.tags, { Name = "${var.domain_name}-opensearch" })
}

resource "aws_kms_alias" "opensearch" {
  count = var.create_dedicated_kms_key ? 1 : 0

  name          = "alias/1commandai-opensearch-${replace(lower(var.domain_name), "/[^a-z0-9-]+/", "-")}"
  target_key_id = aws_kms_key.opensearch[0].key_id
}

locals {
  opensearch_kms_key_id = var.encrypt_at_rest_enabled ? (
    var.kms_key_id != null ? var.kms_key_id : (
      var.create_dedicated_kms_key ? aws_kms_key.opensearch[0].arn : null
    )
  ) : null
}
