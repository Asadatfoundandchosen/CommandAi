variable "aws_region" {
  type = string
}

variable "domain_name" {
  type        = string
  description = "OpenSearch domain name (3–28 lowercase chars)."
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "allowed_security_group_ids" {
  type = list(string)
}

variable "opensearch_access_principal_arns" {
  type        = list(string)
  description = "IAM principals allowed `es:ESHttp*` (e.g. EKS node role ARN)."
}

variable "warm_enabled" {
  type    = bool
  default = false
}
