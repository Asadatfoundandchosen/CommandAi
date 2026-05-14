# Documents / exports **files** bucket — **SSE-KMS**, **versioning**, **block all public access**.
# Cross-region replication is in **`s3-bucket-crr`**. IAM policy for API tasks in **`iam_api.tf`**.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

resource "aws_kms_key" "files" {
  description             = "1CommandAI files bucket ${var.bucket_name} (S3 SSE)"
  deletion_window_in_days = var.kms_deletion_window_days
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
        Principal = {
          Service = "s3.amazonaws.com"
        }
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
            "kms:ViaService" = "s3.${data.aws_region.current.id}.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = merge(var.tags, { Name = "${var.bucket_name}-s3" })
}

resource "aws_kms_alias" "files" {
  name          = "alias/1commandai-files-${var.environment}"
  target_key_id = aws_kms_key.files.key_id
}

resource "aws_s3_bucket" "files" {
  bucket = var.bucket_name
  tags   = merge(var.tags, { Name = var.bucket_name })
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.files.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket = aws_s3_bucket.files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "files_deny_insecure" {
  bucket = aws_s3_bucket.files.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.files.arn,
          "${aws_s3_bucket.files.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
