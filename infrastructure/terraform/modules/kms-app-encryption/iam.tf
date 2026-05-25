# Optional IAM policy documents to attach to app / admin roles (attach in the consuming stack).

data "aws_iam_policy_document" "app_kms_use" {
  statement {
    sid    = "UseAppEncryptionKey"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.app.arn]
  }
}

data "aws_iam_policy_document" "admin_kms_manage" {
  statement {
    sid    = "ManageAppEncryptionKey"
    effect = "Allow"
    actions = [
      "kms:DescribeKey",
      "kms:GetKeyPolicy",
      "kms:PutKeyPolicy",
      "kms:EnableKeyRotation",
      "kms:RotateKeyOnDemand",
      "kms:ListGrants",
      "kms:CreateGrant",
      "kms:RevokeGrant",
    ]
    resources = [aws_kms_key.app.arn]
  }
}

resource "aws_iam_policy" "app_kms_use" {
  name_prefix = "${var.name_prefix}-app-kms-use-"
  description = "Allow platform API to use the application encryption CMK"
  policy      = data.aws_iam_policy_document.app_kms_use.json

  tags = var.tags
}

resource "aws_iam_policy" "admin_kms_manage" {
  count = length(var.admin_role_arns) > 0 ? 1 : 0

  name_prefix = "${var.name_prefix}-app-kms-admin-"
  description = "Allow security/platform admins to manage the application encryption CMK"
  policy      = data.aws_iam_policy_document.admin_kms_manage.json

  tags = var.tags
}
