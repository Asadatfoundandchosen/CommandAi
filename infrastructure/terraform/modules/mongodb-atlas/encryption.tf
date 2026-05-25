# MongoDB Atlas **encryption at rest** (AES-256) with **AWS KMS** customer-managed key (CMK) per project.
# Requires Atlas ↔ AWS IAM role (cloud provider access) before `mongodbatlas_encryption_at_rest`.
# See `docs/runbooks/encryption-at-rest.md`.

data "aws_caller_identity" "encryption" {
  count = var.encryption_at_rest_enabled ? 1 : 0
}

data "aws_region" "encryption" {
  count = var.encryption_at_rest_enabled ? 1 : 0
}

resource "aws_kms_key" "atlas" {
  count = var.encryption_at_rest_enabled && var.create_atlas_kms_key ? 1 : 0

  description             = "MongoDB Atlas encryption at rest — ${var.atlas_project_name}"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableAccountUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.encryption[0].account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${var.atlas_project_name}-atlas"
    Application = "1commandai-mongodb-atlas"
  }
}

resource "aws_kms_alias" "atlas" {
  count = var.encryption_at_rest_enabled && var.create_atlas_kms_key ? 1 : 0

  name          = "alias/1commandai-atlas-${replace(lower(var.atlas_project_name), "/[^a-z0-9-]+/", "-")}"
  target_key_id = aws_kms_key.atlas[0].key_id
}

data "aws_kms_key" "existing" {
  count  = var.encryption_at_rest_enabled && !var.create_atlas_kms_key ? 1 : 0
  key_id = var.atlas_kms_key_arn
}

locals {
  atlas_kms_key_arn = var.encryption_at_rest_enabled ? (
    var.create_atlas_kms_key ? aws_kms_key.atlas[0].arn : data.aws_kms_key.existing[0].arn
  ) : null

  atlas_kms_key_id = var.encryption_at_rest_enabled ? (
    var.create_atlas_kms_key ? aws_kms_key.atlas[0].id : data.aws_kms_key.existing[0].id
  ) : null
}

resource "mongodbatlas_cloud_provider_access_setup" "aws" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  project_id    = mongodbatlas_project.this.id
  provider_name = "AWS"
}

resource "aws_iam_role" "atlas_kms" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  name_prefix = "atlas-kms-"
  description = "Atlas IAM role for KMS encryption at rest (${var.atlas_project_name})"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = mongodbatlas_cloud_provider_access_setup.aws[0].aws_config[0].atlas_aws_account_arn
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "sts:ExternalId" = mongodbatlas_cloud_provider_access_setup.aws[0].aws_config[0].atlas_assumed_role_external_id
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.atlas_project_name}-atlas-kms"
    Application = "1commandai-mongodb-atlas"
  }
}

resource "aws_iam_role_policy" "atlas_kms" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  name = "atlas-kms-key-use"
  role = aws_iam_role.atlas_kms[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UseAtlasProjectKey"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:DescribeKey",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:RevokeGrant",
        ]
        Resource = local.atlas_kms_key_arn
      }
    ]
  })
}

resource "aws_kms_key_policy" "atlas_role" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  key_id = local.atlas_kms_key_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableAccountUse"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.encryption[0].account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowAtlasKmsRole"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.atlas_kms[0].arn
        }
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:DescribeKey",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:RevokeGrant",
        ]
        Resource = "*"
      }
    ]
  })
}

resource "mongodbatlas_cloud_provider_access_authorization" "aws" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  project_id = mongodbatlas_project.this.id
  role_id    = mongodbatlas_cloud_provider_access_setup.aws[0].role_id

  aws {
    iam_assumed_role_arn = aws_iam_role.atlas_kms[0].arn
  }

  depends_on = [aws_iam_role_policy.atlas_kms]
}

resource "mongodbatlas_encryption_at_rest" "this" {
  count = var.encryption_at_rest_enabled ? 1 : 0

  project_id = mongodbatlas_project.this.id

  aws_kms_config {
    enabled                = true
    customer_master_key_id = local.atlas_kms_key_arn
    region                 = var.atlas_aws_region_name
    role_id                = mongodbatlas_cloud_provider_access_setup.aws[0].role_id
  }

  depends_on = [
    mongodbatlas_cloud_provider_access_authorization.aws,
    aws_kms_key_policy.atlas_role,
  ]
}
