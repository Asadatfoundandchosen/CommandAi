# Application CMK — field-level encryption envelope, secrets bootstrap, and future KMS-native crypto.
# Automatic annual rotation (`enable_key_rotation`). Audit via CloudTrail (kms.amazonaws.com).

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "app_key" {
  # Account root retains full control (break-glass / policy updates).
  statement {
    sid    = "EnableAccountRoot"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions   = ["kms:*"]
    resources = ["*"]
  }

  # Application runtime: encrypt / decrypt / generate data keys only.
  statement {
    sid    = "AppEncryptDecrypt"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = var.app_role_arns
    }
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:DescribeKey",
    ]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = length(var.additional_decrypt_role_arns) > 0 ? [1] : []
    content {
      sid    = "AdditionalDecrypt"
      effect = "Allow"
      principals {
        type        = "AWS"
        identifiers = var.additional_decrypt_role_arns
      }
      actions   = ["kms:Decrypt", "kms:DescribeKey"]
      resources = ["*"]
    }
  }

  # Platform / security admin: rotate, schedule deletion, update policies.
  dynamic "statement" {
    for_each = length(var.admin_role_arns) > 0 ? [1] : []
    content {
      sid    = "AdminKeyManagement"
      effect = "Allow"
      principals {
        type        = "AWS"
        identifiers = var.admin_role_arns
      }
      actions = [
        "kms:Create*",
        "kms:Describe*",
        "kms:Enable*",
        "kms:List*",
        "kms:Put*",
        "kms:Update*",
        "kms:Revoke*",
        "kms:Disable*",
        "kms:Get*",
        "kms:Delete*",
        "kms:ScheduleKeyDeletion",
        "kms:CancelKeyDeletion",
        "kms:RotateKeyOnDemand",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_kms_key" "app" {
  description             = "1CommandAI application encryption (${var.environment})"
  deletion_window_in_days = var.kms_deletion_window_days
  enable_key_rotation     = true
  policy                  = data.aws_iam_policy_document.app_key.json

  tags = merge(
    var.tags,
    {
      Name        = "${var.name_prefix}-app-encryption"
      Environment = var.environment
      Purpose     = "field-encryption-envelope"
    },
  )
}

resource "aws_kms_alias" "app" {
  name          = "alias/${replace(lower(var.name_prefix), "/[^a-z0-9-]+/", "-")}-app-encryption"
  target_key_id = aws_kms_key.app.key_id
}
