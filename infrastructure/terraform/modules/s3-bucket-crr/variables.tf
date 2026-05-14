variable "environment" {
  type = string
}

variable "source_bucket_id" {
  type        = string
  description = "Name of the source (primary) bucket"
}

variable "source_bucket_arn" {
  type = string
}

variable "source_kms_key_id" {
  type        = string
  description = "KMS **key id** of the source bucket (for `aws_kms_grant` on default provider region)"
}

variable "source_kms_key_arn" {
  type = string
}

variable "replica_bucket_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "replication_enabled" {
  type        = bool
  default     = true
  description = "Set false to skip CRR"
}

variable "replica_region" {
  type = string
}
