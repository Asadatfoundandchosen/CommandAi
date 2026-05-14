variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "atlas_public_key" {
  type        = string
  description = "MongoDB Atlas programmatic API public key"
  sensitive   = true
}

variable "atlas_private_key" {
  type        = string
  description = "MongoDB Atlas programmatic API private key"
  sensitive   = true
}

variable "atlas_org_id" {
  type        = string
  description = "Atlas organization ID"
  sensitive   = true
}

variable "atlas_project_name" {
  type    = string
  default = "1commandai-prod"
}

variable "eks_vpc_id" {
  type        = string
  description = "EKS application VPC (same account/region)"
}

variable "eks_vpc_cidr" {
  type        = string
  description = "CIDR of the EKS VPC (for peering and allow list)"
}

variable "private_route_table_ids" {
  type        = list(string)
  description = "Private route table IDs to reach Atlas over the peering"
}

variable "atlas_container_cidr" {
  type        = string
  default     = "10.8.0.0/21"
  description = "Must not overlap eks_vpc_cidr"
}
