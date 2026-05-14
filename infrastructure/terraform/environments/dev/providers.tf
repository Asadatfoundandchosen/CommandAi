provider "aws" {
  region = var.aws_region

  skip_credentials_validation = var.aws_skip_credential_checks
  skip_requesting_account_id  = var.aws_skip_credential_checks
  skip_metadata_api_check     = var.aws_skip_credential_checks

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
    }
  }
}
