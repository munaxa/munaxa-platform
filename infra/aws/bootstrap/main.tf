# The shared stack's bootstrap: what must exist before GitHub Actions can run anything.
#
# | Resource                        | Purpose                                                        |
# | ------------------------------- | -------------------------------------------------------------- |
# | State bucket and its key        | Terraform state for stack/ (nonprod and prod keys) and this root |
# | ECR repositories                | One per image, immutable tags, scan on push                    |
# | Workload boundary               | The ceiling for every role the stack creates                   |
# | Deployer role                   | Runs stack/ Terraform; IAM only under /munaxa-shared/ with the  |
# |                                 | boundary; never touches Munaxa Docs                            |
# | CI role                         | munaxa-platform main, environment aws-nonprod/aws-prod → deployer |
# | Image publisher roles           | One per product repository: push to its own ECR repositories   |
#
# The GitHub OIDC provider already exists in this account (Munaxa Docs bootstrap) and is read, not
# created: an account has one provider per URL.

locals {
  prefix       = "munaxa-shared"
  state_bucket = "${local.prefix}-tfstate-${var.account_id}"
  oidc         = "token.actions.githubusercontent.com"
  subject = {
    for name, id in var.github_repositories : name => "repo:${var.github_owner}@${var.github_owner_id}/${name}@${id}"
  }
  ecr = merge([
    for repository, images in var.image_repositories : {
      for image in images : "${repository}/${image}" => { repository = repository, image = image }
    }
  ]...)
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://${local.oidc}"
}

# --- State ---------------------------------------------------------------------------------------

resource "aws_kms_key" "state" {
  description             = "${local.prefix} Terraform state"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "state" {
  name          = "alias/${local.prefix}-tfstate"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "TlsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# --- Images --------------------------------------------------------------------------------------

resource "aws_ecr_repository" "image" {
  for_each = local.ecr

  name                 = each.key # munaxa-<product>/<image>
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "image" {
  for_each   = aws_ecr_repository.image
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Untagged layers after 7 days"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 7 }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the last 20 tagged images (rollback targets)"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
        action       = { type = "expire" }
      },
    ]
  })
}
