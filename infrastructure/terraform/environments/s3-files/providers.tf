provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# DR region for CRR (second provider for `s3-bucket-crr` module)
provider "aws" {
  alias  = "replica"
  region = var.dr_aws_region

  default_tags {
    tags = var.tags
  }
}
