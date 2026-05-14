# **Lifecycle:** `uploads/` → **Glacier** after **90d**, **delete** current version after **365d**.
# **`audit-exports/`** — no object expiration (retain indefinitely); only **incomplete MPU** cleanup (AWS requires an action on every rule).

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    id     = "archive"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }

  rule {
    id     = "audit-keep-forever"
    status = "Enabled"

    filter {
      prefix = "audit-exports/"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.files]
}
