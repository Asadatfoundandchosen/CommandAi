variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes version (1.28+)"
  type        = string
  default     = "1.31"
}

variable "vpc_id" {
  description = "VPC ID for the cluster"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs for the control plane and workers (typically private subnets)"
  type        = list(string)
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "cluster_endpoint_public_access" {
  description = "Whether the Kubernetes API is reachable from the public internet"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to EKS and IAM resources"
  type        = map(string)
  default     = {}
}
