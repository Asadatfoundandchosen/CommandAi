variable "name_prefix" {
  type        = string
  description = "Prefix for KMS key alias and tags (e.g. 1commandai-prod)."
}

variable "environment" {
  type        = string
  description = "Environment label (dev, staging, prod)."
}

variable "app_role_arns" {
  type        = list(string)
  description = "IAM role ARNs allowed kms:Decrypt / kms:Encrypt / kms:GenerateDataKey (API pods / app runtime)."
  default     = []

  validation {
    condition     = length(var.app_role_arns) > 0
    error_message = "Provide at least one app_role_arn (e.g. EKS IRSA for platform-api)."
  }
}

variable "admin_role_arns" {
  type        = list(string)
  description = "IAM role ARNs allowed key administration and on-demand rotation."
  default     = []
}

variable "additional_decrypt_role_arns" {
  type        = list(string)
  description = "Optional roles (e.g. backup, DBA) with decrypt-only access."
  default     = []
}

variable "kms_deletion_window_days" {
  type        = number
  default     = 30
  description = "Waiting period before CMK deletion."
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to the CMK."
}
