variable "name_prefix" {
  description = "Prefix for resource Name tags and resource names"
  type        = string
}

variable "availability_zones" {
  description = "Exactly three AZ names for public/private subnet pairs (must exist in the target region)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]

  validation {
    condition     = length(var.availability_zones) == 3
    error_message = "Exactly three availability zones are required (one NAT Gateway per AZ)."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)"
  type        = list(string)
  default = [
    "10.0.1.0/24",
    "10.0.2.0/24",
    "10.0.3.0/24",
  ]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)"
  type        = list(string)
  default = [
    "10.0.10.0/24",
    "10.0.11.0/24",
    "10.0.12.0/24",
  ]
}

variable "tags" {
  description = "Additional tags merged into all resources"
  type        = map(string)
  default     = {}
}
