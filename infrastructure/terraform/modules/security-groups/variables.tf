variable "vpc_id" {
  description = "VPC ID where security groups are created"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC IPv4 CIDR (used for sg_internal and east-west egress)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for security group Name tags and resource names"
  type        = string
}

variable "environment" {
  description = "Environment tag value (e.g. prod, staging)"
  type        = string
}

variable "project" {
  description = "Project tag value"
  type        = string
}

variable "tags" {
  description = "Additional tags merged into all security groups"
  type        = map(string)
  default     = {}
}
