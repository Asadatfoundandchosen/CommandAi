resource "aws_acm_certificate" "api" {
  count = var.create_acm_certificate ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = var.subject_alternative_names
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-api-tls" })
}

locals {
  certificate_arn = var.create_acm_certificate ? aws_acm_certificate.api[0].arn : var.certificate_arn
}
