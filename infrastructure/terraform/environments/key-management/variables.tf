variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project_name" {
  type    = string
  default = "1commandai"
}

variable "environment" {
  type        = string
  description = "dev | staging | prod"
}

variable "app_role_arns" {
  type        = list(string)
  description = "EKS IRSA / EC2 role ARNs for platform-api (kms:Decrypt, kms:GenerateDataKey)."
}

variable "admin_role_arns" {
  type        = list(string)
  default     = []
  description = "Security / platform admin roles (key policy, rotation)."
}
