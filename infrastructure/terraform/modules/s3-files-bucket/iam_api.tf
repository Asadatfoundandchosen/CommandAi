# Attach this policy to the **API** task role (EKS IRSA) or a dedicated IAM user for the backend.
# Scope: this bucket + KMS for SSE.

data "aws_iam_policy_document" "api_files_access" {
  statement {
    sid    = "ListBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketLocation",
    ]
    resources = [aws_s3_bucket.files.arn]
  }

  statement {
    sid    = "ObjectRW"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListBucketMultipartUploads",
    ]
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }

  statement {
    sid    = "KmsForS3"
    effect = "Allow"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:GenerateDataKey",
      "kms:DescribeKey",
    ]
    resources = [aws_kms_key.files.arn]
  }
}

resource "aws_iam_policy" "api_files_access" {
  name        = "1commandai-api-files-${var.environment}"
  description = "API read/write to ${var.bucket_name} and KMS SSE"
  policy      = data.aws_iam_policy_document.api_files_access.json

  tags = var.tags
}
