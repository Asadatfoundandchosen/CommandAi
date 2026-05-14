variable "environment" {
  type        = string
  description = "e.g. dev, staging, prod"
}

variable "bucket_name" {
  type        = string
  description = "S3 bucket name (globally unique), e.g. 1commandai-files-prod"
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags applied to bucket and keys"
}

variable "enable_versioning" {
  type        = bool
  default     = true
  description = "S3 object versioning (required for CRR on source if enabled later)"
}

variable "kms_deletion_window_days" {
  type        = number
  default     = 30
  description = "KMS key pending window (7–30 in AWS)"
}
