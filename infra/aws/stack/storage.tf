# Object storage: one private bucket per product that stores files (School, and Docs where this
# environment hosts it). Part of the persistent layer: an empty bucket costs nothing, and a session
# never creates or deletes one.
#
# | Bucket                                   | Written by           | Object keys                    |
# | ---------------------------------------- | -------------------- | ------------------------------ |
# | munaxa-<env>-school-files-<account>      | school-api task role | tenants/<tenantId>/...         |
# | munaxa-<env>-docs-files-<account>        | docs-api task role   | the Docs storage layout        |
#
# Every bucket: Block Public Access, owner-enforced objects, SSE-S3, TLS only, CORS for its own
# origin (browsers upload and download with presigned URLs), and incomplete uploads removed after a
# day. Names never start with munaxa-docs, which the deployer may not touch (Docs Production).
# Tasks reach S3 through the gateway endpoint, whose policy admits these buckets (network.tf).

locals {
  buckets = merge(
    {
      school = {
        name    = "${local.prefix}-school-files-${var.account_id}"
        origin  = "https://${var.hosts.school}"
        methods = ["GET", "PUT"]
        headers = ["content-type", "content-length"]
        expose  = []
        # School keeps no versions (test data; the owner's spec).
        versioned = false
      }
    },
    local.docs_enabled ? {
      docs = {
        name      = "${local.prefix}-docs-files-${var.account_id}"
        origin    = "https://${var.hosts.docs}"
        methods   = ["GET", "PUT"]
        headers   = ["content-type", "x-amz-checksum-sha256"]
        expose    = ["ETag"]
        versioned = true # as Docs Production (its data/s3.tf)
      }
    } : {},
  )
}

resource "aws_s3_bucket" "files" {
  for_each = local.buckets

  bucket = each.value.name
}

resource "aws_s3_bucket_public_access_block" "files" {
  for_each = aws_s3_bucket.files

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "files" {
  for_each = aws_s3_bucket.files

  bucket = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  for_each = aws_s3_bucket.files

  bucket = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "files" {
  for_each = { for k, v in local.buckets : k => v if v.versioned }

  bucket = aws_s3_bucket.files[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  for_each = local.buckets

  bucket = aws_s3_bucket.files[each.key].id

  rule {
    id     = "incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  dynamic "rule" {
    for_each = each.value.versioned ? [1] : []
    content {
      id     = "noncurrent-versions"
      status = "Enabled"
      filter {}
      noncurrent_version_expiration {
        noncurrent_days           = 30
        newer_noncurrent_versions = 3
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.files]
}

resource "aws_s3_bucket_cors_configuration" "files" {
  for_each = local.buckets

  bucket = aws_s3_bucket.files[each.key].id
  cors_rule {
    allowed_origins = [each.value.origin]
    allowed_methods = each.value.methods
    allowed_headers = each.value.headers
    expose_headers  = each.value.expose
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "files" {
  for_each = aws_s3_bucket.files

  bucket = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [each.value.arn, "${each.value.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.files]
}

# The names services.tf and docs.tf use.
locals {
  school_files_bucket = aws_s3_bucket.files["school"]
}
