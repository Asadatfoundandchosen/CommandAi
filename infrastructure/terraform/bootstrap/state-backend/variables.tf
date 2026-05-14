variable "aws_region" {
  description = "Region for the state bucket and lock table (must match backend region in environment versions.tf)"
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state"
  type        = string
  default     = "1commandai-terraform-state"
}

variable "lock_table_name" {
  description = "DynamoDB table name for state locking (must match dynamodb_table in environment backends)"
  type        = string
  default     = "terraform-locks"
}

variable "tags" {
  description = "Tags for the bucket and table"
  type        = map(string)
  default = {
    ManagedBy = "terraform"
    Purpose   = "terraform-state-backend"
  }
}
