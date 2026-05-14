variable "environment" {
  description = "Deployment environment name (used in resource naming and tags)"
  type        = string
  default     = "dr"
}

variable "aws_region" {
  description = "AWS region for DR footprint (defaults to a secondary US region; override if DR lives elsewhere)"
  type        = string
  default     = "us-west-2"
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "1commandai"
}

variable "availability_zones" {
  description = "Three AZs for the VPC module (must exist in aws_region)"
  type        = list(string)
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

variable "aws_skip_credential_checks" {
  description = "Set true for plan/validate without AWS credentials (CI); use false for real applies"
  type        = bool
  default     = false
}
