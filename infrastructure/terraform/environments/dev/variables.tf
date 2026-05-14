variable "environment" {
  description = "Deployment environment name (used in resource naming and tags)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for this environment"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "1commandai"
}

variable "availability_zones" {
  description = "Three AZs for the VPC module (must exist in aws_region)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "aws_skip_credential_checks" {
  description = "Set true for plan/validate without AWS credentials (CI); use false for real applies"
  type        = bool
  default     = false
}
