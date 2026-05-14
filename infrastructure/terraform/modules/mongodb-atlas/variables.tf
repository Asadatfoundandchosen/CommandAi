variable "atlas_org_id" {
  type        = string
  description = "MongoDB Atlas organization ID (string from Atlas org settings)"
  sensitive   = true
}

variable "atlas_project_name" {
  type        = string
  description = "MongoDB Atlas project name (logical grouping in Atlas UI)"
}

variable "atlas_cidr_for_network_container" {
  type        = string
  description = "CIDR for the Atlas network container. Must not overlap the EKS VPC CIDR. Example: 10.8.0.0/21"
  default     = "10.8.0.0/21"
}

variable "atlas_aws_region_name" {
  type        = string
  description = "Atlas region (AWS) for cluster + network, e.g. US_EAST_1"
  default     = "US_EAST_1"
}

variable "atlas_aws_accepter_region" {
  type        = string
  description = "Lowercase region for the AWS network peering resource, e.g. us-east-1"
  default     = "us-east-1"
}

variable "cluster_name" {
  type        = string
  description = "Name of the Atlas cluster in the project"
  default     = "app-main"
}

variable "mongo_db_major_version" {
  type        = string
  description = "Major MongoDB server version (Atlas-supported)"
  default     = "7.0"
}

variable "instance_size" {
  type        = string
  description = "Dedicated instance size in AWS region (M30+ for production per platform standards)"
  default     = "M30"
}

variable "electable_nodes" {
  type        = number
  description = "Number of electable data-bearing nodes in the region"
  default     = 3
}

variable "initial_disk_size_gb" {
  type        = number
  description = "Initial disk per node; auto-scaling can grow from here when enabled"
  default     = 80
}

variable "app_database_name" {
  type        = string
  description = "Application database name (scopes for readWrite / read / dbAdmin roles)"
  default     = "app_db"
}

variable "eks_vpc_id" {
  type        = string
  description = "EKS (application) VPC ID for peering to Atlas (same AWS account)"
}

variable "eks_vpc_cidr" {
  type        = string
  description = "CIDR of the EKS VPC (customer route table in Atlas peering configuration)"
}

variable "aws_account_id" {
  type        = string
  description = "12-digit AWS account that owns the EKS VPC (same as Atlas peering accepter)"
}

# Cloud backup policy (must meet any Atlas project backup compliance minimums)
variable "backup_reference_hour_of_day" {
  type        = number
  description = "UTC hour (0-23) used as the reference point for cloud backup policy alignment in Atlas"
  default     = 3
}

variable "backup_reference_minute_of_hour" {
  type        = number
  description = "UTC minute (0-59) for backup policy reference (cluster schedule alignment)"
  default     = 0
}

variable "backup_restore_window_days" {
  type        = number
  description = "Point-in-time restore window in days (e.g. 7 = PITR within the last 7 days, subject to Atlas tier)"
  default     = 7
}

variable "backup_snapshot_retention_days" {
  type        = number
  description = "Retention of hourly snapshot chain in days (platform default 30)"
  default     = 30
}
