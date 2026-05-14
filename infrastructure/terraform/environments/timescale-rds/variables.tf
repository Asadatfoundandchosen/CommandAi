variable "aws_region" {
  type        = string
  description = "AWS region for RDS (e.g. us-east-1)."
}

variable "project_name" {
  type        = string
  description = "Short project name for tags and identifiers."
}

variable "vpc_id" {
  type        = string
  description = "Existing VPC id (same as EKS / API tier)."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets in at least two AZs."
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "SGs that may connect to PostgreSQL (e.g. EKS cluster SG)."
}

variable "skip_final_snapshot" {
  type        = bool
  default     = false
  description = "Dev-only: allow destroy without final snapshot."
}

variable "deletion_protection" {
  type        = bool
  default     = true
}
