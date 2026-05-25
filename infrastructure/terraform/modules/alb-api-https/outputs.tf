output "alb_arn" {
  value       = aws_lb.api.arn
  description = "Application Load Balancer ARN."
}

output "alb_dns_name" {
  value       = aws_lb.api.dns_name
  description = "Public DNS name — point api.<domain> CNAME here; verify with SSL Labs."
}

output "alb_zone_id" {
  value       = aws_lb.api.zone_id
  description = "Route53 alias target hosted zone ID."
}

output "https_listener_arn" {
  value       = aws_lb_listener.https.arn
  description = "HTTPS listener (TLS 1.3 policy)."
}

output "target_group_arn" {
  value       = aws_lb_target_group.api.arn
  description = "Target group for EKS / API pods."
}

output "certificate_arn" {
  value       = local.certificate_arn
  description = "ACM certificate used on the HTTPS listener."
}

output "ssl_policy" {
  value       = var.ssl_policy
  description = "Applied ELB security policy name."
}

output "acm_validation_records" {
  value = var.create_acm_certificate ? [
    for dvo in aws_acm_certificate.api[0].domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ] : []
  description = "DNS records to create for ACM validation when create_acm_certificate is true."
}
