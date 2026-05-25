# Amazon **OpenSearch Service** 2.x (Elasticsearch **8.x**–compatible API): VPC, encryption, multi-AZ hot tier.
# Master user password → **Vault** after apply (see `docs/OPENSEARCH.md`).

locals {
  domain_arn = aws_opensearch_domain.this.arn
}

resource "random_password" "master" {
  count            = var.enable_internal_user_database ? 1 : 0
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>?:"
}

resource "aws_security_group" "opensearch" {
  name_prefix = "${var.domain_name}-os-"
  description = "OpenSearch / HTTPS 443 from allowed SGs only"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = var.allowed_security_group_ids
    content {
      description     = "HTTPS from allowed SG"
      from_port       = 443
      to_port         = 443
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Egress (AWS requirement)"
  }

  tags = merge({ Name = "${var.domain_name}-sg-opensearch" }, var.tags)

  lifecycle {
    create_before_destroy = true
  }
}

data "aws_iam_policy_document" "opensearch_access" {
  statement {
    sid    = "AllowFromVpcPrincipals"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = var.opensearch_access_principal_arns
    }
    actions   = ["es:ESHttp*"]
    resources = ["${local.domain_arn}/*"]
  }
}

resource "aws_opensearch_domain" "this" {
  domain_name    = var.domain_name
  engine_version = var.engine_version

  cluster_config {
    instance_count = var.data_instance_count
    instance_type  = var.data_instance_type

    zone_awareness_enabled = true
    zone_awareness_config {
      availability_zone_count = 3
    }

    dedicated_master_enabled = var.dedicated_master_enabled
    dedicated_master_count   = var.dedicated_master_enabled ? var.dedicated_master_count : null
    dedicated_master_type    = var.dedicated_master_enabled ? var.dedicated_master_type : null

    warm_enabled = var.warm_enabled
    warm_count   = var.warm_enabled ? var.warm_count : null
    warm_type    = var.warm_enabled ? var.warm_type : null
  }

  ebs_options {
    ebs_enabled = true
    volume_size = var.ebs_volume_size_gb
    volume_type = "gp3"
    throughput  = 125
  }

  encrypt_at_rest {
    enabled    = var.encrypt_at_rest_enabled
    kms_key_id = local.opensearch_kms_key_id
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  vpc_options {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.opensearch.id]
  }

  access_policies = data.aws_iam_policy_document.opensearch_access.json

  dynamic "advanced_security_options" {
    for_each = var.enable_internal_user_database ? [1] : []
    content {
      enabled                        = true
      internal_user_database_enabled = true
      master_user_options {
        master_user_name     = var.master_user_name
        master_user_password = random_password.master[0].result
      }
    }
  }

  tags = merge(
    {
      Name        = var.domain_name
      Application = "1commandai-audit-search"
    },
    var.tags,
  )
}
