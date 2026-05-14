# S3 **files** bucket (documents / exports) + optional **CRR** to `dr_aws_region`.
# Apply from this directory; copy `bucket_id` and `api_files_policy_arn` to **Vault** / **Kubernetes**.

module "files" {
  source = "../../modules/s3-files-bucket"

  environment  = var.environment
  bucket_name  = "1commandai-files-${var.environment}"
  enable_versioning = true
  tags         = var.tags
}

module "crr" {
  source = "../../modules/s3-bucket-crr"
  providers = {
    aws         = aws
    aws.replica = aws.replica
  }

  environment         = var.environment
  source_bucket_id    = module.files.bucket_id
  source_bucket_arn   = module.files.bucket_arn
  source_kms_key_id   = module.files.kms_key_id
  source_kms_key_arn  = module.files.kms_key_arn
  replica_bucket_name = "1commandai-files-${var.environment}-dr-${replace(var.dr_aws_region, "-", "")}"
  replica_region      = var.dr_aws_region
  replication_enabled = var.enable_crr
  tags                = var.tags
}
