variable "name_prefix" {
  type        = string
  description = "Prefix for resource names (e.g. 1commandai-prod)"
}

variable "vpc_id" {
  type        = string
  description = "VPC to place ElastiCache security group and subnet group"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets for the ElastiCache replication group (multi-AZ)"
}

variable "api_security_group_id" {
  type        = string
  description = "EKS / API security group — only this SG may open TCP/6379 to Redis"
}

variable "node_type" {
  type        = string
  description = "ElastiCache node class (e.g. cache.r6g.large)"
  default     = "cache.r6g.large"
}

variable "engine_version" {
  type        = string
  description = "Redis engine version (7.0+)"
  default     = "7.0"
}

variable "num_shards" {
  type        = number
  description = "Number of slots / shards (primary nodes)"
  default     = 3
}

variable "replicas_per_node_group" {
  type        = number
  description = "Read replicas per shard (excludes primary). 1 + 1 per shard = 2 nodes per shard. 3 shards × 2 = 6 nodes total (3 primary + 3 replica)"
  default     = 1
}

variable "tags" {
  type        = map(string)
  default     = {}
  description = "Tags for all resources"
}

variable "apply_immediately" {
  type        = bool
  default     = false
  description = "If true, apply cluster changes immediately (use cautiously in prod)"
}
