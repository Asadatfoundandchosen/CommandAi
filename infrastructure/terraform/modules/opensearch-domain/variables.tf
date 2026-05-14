variable "domain_name" {
  type        = string
  description = "OpenSearch domain name (lowercase, 3–28 chars)."
}

variable "vpc_id" {
  type        = string
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnets in **3 AZs** for multi-AZ data nodes."

  validation {
    condition     = length(var.private_subnet_ids) >= 3
    error_message = "Provide at least three private subnets (one per AZ) for zone awareness."
  }
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "Security groups allowed to reach HTTPS (443) on the domain endpoint (e.g. EKS worker SG)."

  validation {
    condition     = length(var.allowed_security_group_ids) > 0
    error_message = "Provide at least one security group for OpenSearch ingress."
  }
}

variable "engine_version" {
  type        = string
  default     = "OpenSearch_2.13"
  description = "OpenSearch **2.x** (Elasticsearch 8.x–compatible API)."
}

variable "data_instance_type" {
  type        = string
  default     = "r6g.large.search"
}

variable "data_instance_count" {
  type        = number
  default     = 3
  description = "Hot **data** nodes (multi-AZ)."
}

variable "ebs_volume_size_gb" {
  type        = number
  default     = 500
  description = "GP3 volume size **per data node** (hot tier)."
}

variable "dedicated_master_enabled" {
  type        = bool
  default     = true
}

variable "dedicated_master_count" {
  type        = number
  default     = 3
}

variable "dedicated_master_type" {
  type        = string
  default     = "m6g.large.search"
}

variable "warm_enabled" {
  type        = bool
  default     = false
  description = "Optional **UltraWarm** tier (HDD-backed warm nodes)."
}

variable "warm_count" {
  type        = number
  default     = 2
}

variable "warm_type" {
  type        = string
  default     = "ultrawarm1.medium.search"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "opensearch_access_principal_arns" {
  type        = list(string)
  description = "IAM principal ARNs allowed `es:ESHttp*` on this domain (e.g. EKS node group role, pod IRSA role)."

  validation {
    condition     = length(var.opensearch_access_principal_arns) > 0
    error_message = "Provide at least one IAM principal ARN for domain access."
  }
}

variable "enable_internal_user_database" {
  type        = bool
  default     = true
  description = "Enable fine-grained access with built-in master user (password in Terraform state once — copy to Vault)."
}

variable "master_user_name" {
  type        = string
  default     = "os_master"
  description = "Built-in master user when internal user DB is enabled."
}
