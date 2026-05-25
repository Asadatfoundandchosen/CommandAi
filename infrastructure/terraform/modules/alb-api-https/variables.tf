variable "name_prefix" {
  type        = string
  description = "Prefix for ALB and target group names."
}

variable "vpc_id" {
  type        = string
  description = "VPC for the target group."
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnets for the internet-facing ALB (multi-AZ)."
}

variable "alb_security_group_id" {
  type        = string
  description = "Security group allowing 80/443 inbound on the ALB."
}

variable "certificate_arn" {
  type        = string
  default     = null
  description = "Existing ACM certificate ARN for HTTPS. Required when create_acm_certificate is false."

  validation {
    condition = (
      var.create_acm_certificate ||
      (var.certificate_arn != null && var.certificate_arn != "")
    )
    error_message = "Provide certificate_arn or set create_acm_certificate = true with domain_name."
  }
}

variable "create_acm_certificate" {
  type        = bool
  default     = false
  description = "Request a new ACM certificate for domain_name (DNS validation)."
}

variable "domain_name" {
  type        = string
  default     = null
  description = "Primary hostname on the ACM cert when create_acm_certificate is true."
}

variable "subject_alternative_names" {
  type        = list(string)
  default     = []
  description = "SANs on the ACM certificate."
}

variable "ssl_policy" {
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  description = "ALB TLS security policy (TLS 1.3 + 1.2)."
}

variable "target_port" {
  type        = number
  default     = 3000
  description = "Backend port (EKS NodePort / instance / IP target)."
}

variable "target_type" {
  type        = string
  default     = "ip"
  description = "ALB target type: ip (EKS) or instance."
}

variable "target_ids" {
  type        = list(string)
  default     = []
  description = "Target IDs to register (optional; often done by AWS LB Controller)."
}

variable "health_check_path" {
  type        = string
  default     = "/health/live"
  description = "ALB health check path."
}

variable "deletion_protection" {
  type        = bool
  default     = true
}

variable "tags" {
  type        = map(string)
  default     = {}
}
