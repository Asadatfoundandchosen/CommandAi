variable "name_prefix" {
  type        = string
  description = "Prefix for resource names (lowercase, DNS-safe)."
}

variable "vpc_id" {
  type        = string
  description = "VPC for the DB subnet group and security group."
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for RDS (Multi-AZ requires at least two AZs)."
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "Security groups allowed to connect on PostgreSQL (e.g. EKS node / API SG)."

  validation {
    condition     = length(var.allowed_security_group_ids) > 0
    error_message = "Provide at least one security group that may reach PostgreSQL on 5432."
  }
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Common tags for all resources."
}

variable "database_name" {
  type        = string
  default     = "metrics"
  description = "Initial PostgreSQL database name."
}

variable "master_username" {
  type        = string
  default     = "timescale_app"
  description = "Master user (not superuser; RDS-managed)."
}

variable "engine_version" {
  type        = string
  default     = "15.8"
  description = "PostgreSQL major.minor (15.x) — pick a version that supports TimescaleDB in your region."
}

variable "instance_class" {
  type        = string
  default     = "db.r6g.large"
  description = "RDS instance class (operator default: db.r6g.large)."
}

variable "allocated_storage_gb" {
  type        = number
  default     = 100
  description = "Allocated storage (GiB); gp3."
}

variable "multi_az" {
  type        = bool
  default     = true
  description = "Enable Multi-AZ standby."
}

variable "storage_encrypted" {
  type        = bool
  default     = true
  description = "Encrypt storage at rest (AWS-managed KMS key unless kms_key_id is set)."
}

variable "kms_key_id" {
  type        = string
  default     = null
  description = "Optional CMK ARN for storage encryption. When null and create_dedicated_kms_key is true, module creates a CMK."
}

variable "create_dedicated_kms_key" {
  type        = bool
  default     = true
  description = "Create a dedicated AWS KMS CMK for RDS storage encryption (recommended for prod)."
}

variable "kms_deletion_window_days" {
  type        = number
  default     = 30
  description = "KMS key deletion window when create_dedicated_kms_key is true."
}

variable "skip_final_snapshot" {
  type        = bool
  default     = false
  description = "Set true only for disposable dev stacks (destroy without final snapshot)."
}

variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Prevent accidental destroy in prod."
}

variable "timescaledb_shared_preload" {
  type        = bool
  default     = true
  description = "Set shared_preload_libraries=timescaledb (requires reboot on first apply). Disable if your region/engine combo rejects it."
}
