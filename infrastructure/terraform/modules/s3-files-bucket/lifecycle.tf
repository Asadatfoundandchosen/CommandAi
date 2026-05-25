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

# **`audit-archives/`** — **GLACIER** at upload; lifecycle may transition further. No expiration (compliance archives).

  rule {
    id     = "audit-archives-glacier"
    status = "Enabled"

    filter {
      prefix = "audit-archives/"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
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
