variable "aws_region" {
  type        = string
  description = "Primary / source bucket region (e.g. us-east-1)"
  default     = "us-east-1"
}

variable "dr_aws_region" {
  type        = string
  description = "DR region for S3 CRR replica (e.g. us-west-2)"
  default     = "us-west-2"
}

variable "environment" {
  type        = string
  description = "dev | staging | prod (bucket name suffix)"
}

variable "enable_crr" {
  type        = bool
  default     = true
  description = "Create cross-region replica bucket + replication. Set false for one-region dev only."
}

variable "tags" {
  type = map(string)
  default = {
    Project     = "1commandai"
    Application = "files"
  }
}
