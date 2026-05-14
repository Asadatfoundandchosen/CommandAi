variable "name_prefix" {
  description = "Prefix for ECR repository names. Repositories are created as \"<name_prefix>/api\" (and worker, frontend)."
  type        = string
}

variable "tags" {
  description = "Tags applied to ECR repositories and the IAM policy."
  type        = map(string)
  default     = {}
}

variable "cross_account_pull_principal_arns" {
  description = "IAM principal ARNs allowed to pull images from these repositories (for example DR: arn:aws:iam::DR_ACCOUNT_ID:root or a role ARN)."
  type        = list(string)
  default     = []
}

variable "eks_node_role_names" {
  description = "EKS worker node IAM role names to attach the scoped ECR pull policy to. Leave empty to create the policy without attachments."
  type        = list(string)
  default     = []
}

variable "lifecycle_tagged_image_retention_count" {
  description = "Maximum number of tagged images to retain per repository (older matching images are expired)."
  type        = number
  default     = 10
}

variable "lifecycle_extra_tag_prefixes" {
  description = "Extra tag prefixes merged into the lifecycle \"tagged\" rule (in addition to single-character and common CI prefixes)."
  type        = list(string)
  default     = []
}

variable "replication_destinations" {
  description = <<-EOT
    Private registry replication destinations for repositories matching PREFIX_MATCH "<name_prefix>/".
    Use for cross-region (same account: set region only) or cross-account DR (set region and registry_id;
    accounts must be in the same AWS Organization per AWS requirements).
    This resource replaces the entire account-level replication configuration when non-empty — import any existing console rules first.
  EOT
  type = list(object({
    region      = string
    registry_id = optional(string)
  }))
  default = []
}
