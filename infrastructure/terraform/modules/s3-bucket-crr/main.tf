# S3 **cross-region replication** (versioning on source, SSE-KMS).
# Default `aws` = **source** account/region; `aws.replica` = **DR** region.

data "aws_caller_identity" "current" {}

# 1) Replication service role (same account as source bucket)
resource "aws_iam_role" "replication" {
  count = var.replication_enabled ? 1 : 0
  name  = "1commandai-s3-crr-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

# 2) DR KMS key — allow S3 in replica region and the replication **role** to write encrypted replicas
resource "aws_kms_key" "replica" {
  count    = var.replication_enabled ? 1 : 0
  provider = aws.replica

  description             = "1CommandAI files DR replica ${var.replica_bucket_name}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableAccountUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowS3"
        Effect = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.replica_region}.amazonaws.com"
          }
        }
      },
      {
        Sid    = "AllowReplicationRole"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.replication[0].arn
        }
        Action = [
          "kms:Encrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.replica_bucket_name}-crr" })
}

resource "aws_s3_bucket" "replica" {
  count    = var.replication_enabled ? 1 : 0
  provider = aws.replica

  bucket = var.replica_bucket_name
  tags   = merge(var.tags, { Name = var.replica_bucket_name, Role = "crr-destination" })
}

resource "aws_s3_bucket_versioning" "replica" {
  count    = var.replication_enabled ? 1 : 0
  provider = aws.replica
  bucket   = aws_s3_bucket.replica[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replica" {
  count    = var.replication_enabled ? 1 : 0
  provider = aws.replica
  bucket   = aws_s3_bucket.replica[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.replica[0].arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "replica" {
  count    = var.replication_enabled ? 1 : 0
  provider = aws.replica
  bucket   = aws_s3_bucket.replica[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 3) Grant the replication role permission to use the **source** CMK
resource "aws_kms_grant" "replication_to_source" {
  count = var.replication_enabled ? 1 : 0

  name              = "1commandai-s3-crr-${var.environment}"
  key_id            = var.source_kms_key_id
  grantee_principal = aws_iam_role.replication[0].arn
  operations = ["Decrypt", "GenerateDataKey"]
}

data "aws_iam_policy_document" "replication" {
  count = var.replication_enabled ? 1 : 0

  statement {
    effect = "Allow"
    actions = [
      "s3:GetReplicationConfiguration",
      "s3:ListBucket",
    ]
    resources = [var.source_bucket_arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:GetObjectVersion",
      "s3:GetObjectVersionTagging",
    ]
    resources = ["${var.source_bucket_arn}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
      "s3:ReplicateTags",
    ]
    resources = ["${aws_s3_bucket.replica[0].arn}/*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [var.source_kms_key_arn]
  }

  statement {
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.replica[0].arn]
  }
}

resource "aws_iam_role_policy" "replication" {
  count  = var.replication_enabled ? 1 : 0
  name   = "1commandai-s3-crr"
  role   = aws_iam_role.replication[0].id
  policy = data.aws_iam_policy_document.replication[0].json
}

resource "aws_s3_bucket_replication_configuration" "main" {
  count  = var.replication_enabled ? 1 : 0
  bucket = var.source_bucket_id
  role   = aws_iam_role.replication[0].arn

  rule {
    id     = "replicate-all"
    status = "Enabled"
    filter {}

    delete_marker_replication {
      status = "Enabled"
    }

    destination {
      bucket        = aws_s3_bucket.replica[0].arn
      storage_class = "STANDARD"
      encryption_configuration {
        replica_kms_key_id = aws_kms_key.replica[0].arn
      }
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }
  }

  depends_on = [
    aws_s3_bucket_versioning.replica,
    aws_iam_role_policy.replication,
    aws_kms_grant.replication_to_source
  ]
}
