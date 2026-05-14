locals {
  services = toset(["api", "worker", "frontend"])

  # "tagged" lifecycle rules require tagPrefixList. Single-character prefixes cover typical semver,
  # hex-style digests, and many CI tags by first character; common multi-char prefixes are included too.
  default_tag_prefixes = concat(
    split("", "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    ["v", "release", "prod", "staging", "dev", "main", "hotfix", "sha", "build"],
  )

  lifecycle_tag_prefixes = distinct(concat(local.default_tag_prefixes, var.lifecycle_extra_tag_prefixes))

  lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire older tagged images when more than ${var.lifecycle_tagged_image_retention_count} tagged images match configured prefixes."
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = local.lifecycle_tag_prefixes
          countType     = "imageCountMoreThan"
          countNumber   = var.lifecycle_tagged_image_retention_count
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_repository" "service" {
  for_each = local.services

  name                 = "${var.name_prefix}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(var.tags, { Service = each.key })
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy     = local.lifecycle_policy
}

resource "aws_ecr_repository_policy" "cross_account_pull" {
  for_each = {
    for name, repo in aws_ecr_repository.service : name => repo
    if length(var.cross_account_pull_principal_arns) > 0
  }

  repository = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCrossAccountPullDR"
        Effect = "Allow"
        Principal = {
          AWS = var.cross_account_pull_principal_arns
        }
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability",
        ]
      }
    ]
  })
}

resource "aws_iam_policy" "eks_nodes_ecr_pull" {
  name_prefix = "${var.name_prefix}-eks-ecr-pull-"
  description = "Allows EKS worker nodes to pull images from ${var.name_prefix} ECR repositories."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EcrAuthToken"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "EcrRepositoryContentRead"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ]
        Resource = [for repo in aws_ecr_repository.service : repo.arn]
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "eks_nodes_ecr_pull" {
  for_each = toset(var.eks_node_role_names)

  role       = each.value
  policy_arn = aws_iam_policy.eks_nodes_ecr_pull.arn
}

# Account-level setting: one configuration per region/account. Cross-account replication requires AWS Organizations.
resource "aws_ecr_replication_configuration" "service_prefix" {
  count = length(var.replication_destinations) > 0 ? 1 : 0

  replication_configuration {
    rule {
      dynamic "destination" {
        for_each = var.replication_destinations
        content {
          region      = destination.value.region
          registry_id = try(destination.value.registry_id, null)
        }
      }

      repository_filter {
        filter      = "${var.name_prefix}/"
        filter_type = "PREFIX_MATCH"
      }
    }
  }

  depends_on = [aws_ecr_repository.service]
}
