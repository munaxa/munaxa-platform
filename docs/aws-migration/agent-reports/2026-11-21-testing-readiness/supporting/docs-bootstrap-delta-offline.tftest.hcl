# Offline delta of the Docs bootstrap: the state as last applied (munaxa-docs a04723a, the commit
# before DC-01) against origin/main. Real hashicorp/aws provider for the local
# aws_iam_policy_document data sources (no AWS call: fake keys, every check skipped); every
# resource is overridden, so nothing reaches AWS.
provider "aws" {
  region                      = "eu-central-1"
  access_key                  = "offline"
  secret_key                  = "offline"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  default_tags {
    tags = { Project = "MunaxaDocs", Environment = "Production", ManagedBy = "Terraform", Stack = "bootstrap" }
  }
}
provider "aws" {
  alias                       = "us_east_1"
  region                      = "us-east-1"
  access_key                  = "offline"
  secret_key                  = "offline"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  default_tags {
    tags = { Project = "MunaxaDocs", Environment = "Production", ManagedBy = "Terraform", Stack = "bootstrap" }
  }
}
variables {
  budget_alert_emails = ["alerts@example.invalid"]
}
override_resource {
  target = aws_budgets_budget.account
}
override_resource {
  target = aws_budgets_budget.production
}
override_resource {
  target = aws_ce_cost_allocation_tag.environment
}
override_resource {
  target = aws_ce_cost_allocation_tag.project
}
override_resource {
  target = aws_cloudtrail.account
  values = { arn = "arn:aws:cloudtrail:eu-central-1:229251310592:trail/mock" }
}
override_resource {
  target = aws_ecr_lifecycle_policy.images
}
override_resource {
  target = aws_ecr_repository.images
  values = { arn = "arn:aws:ecr:eu-central-1:229251310592:repository/mock" }
}
override_resource {
  target = aws_iam_openid_connect_provider.github
  values = { arn = "arn:aws:iam::229251310592:oidc-provider/token.actions.githubusercontent.com" }
}
override_resource {
  target = aws_iam_policy.ci_boundary
  values = { arn = "arn:aws:iam::229251310592:policy/mock" }
}
override_resource {
  target = aws_iam_policy.deployer
  values = { arn = "arn:aws:iam::229251310592:policy/mock" }
}
override_resource {
  target = aws_iam_policy.deployer_boundary
  values = { arn = "arn:aws:iam::229251310592:policy/mock" }
}
override_resource {
  target = aws_iam_policy.image_publisher_boundary
  values = { arn = "arn:aws:iam::229251310592:policy/mock" }
}
override_resource {
  target = aws_iam_policy.workload_boundary
  values = { arn = "arn:aws:iam::229251310592:policy/mock" }
}
override_resource {
  target = aws_iam_role.ci
  values = { arn = "arn:aws:iam::229251310592:role/mock" }
}
override_resource {
  target = aws_iam_role.deployer
  values = { arn = "arn:aws:iam::229251310592:role/mock" }
}
override_resource {
  target = aws_iam_role.image_publisher
  values = { arn = "arn:aws:iam::229251310592:role/mock" }
}
override_resource {
  target = aws_iam_role_policy.ci
}
override_resource {
  target = aws_iam_role_policy.image_publisher
}
override_resource {
  target = aws_iam_role_policy_attachment.deployer
}
override_resource {
  target = aws_kms_alias.state
  values = { arn = "arn:aws:kms:eu-central-1:229251310592:alias/mock" }
}
override_resource {
  target = aws_kms_key.state
  values = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000" }
}
override_resource {
  target = aws_s3_bucket.cloudtrail
  values = { arn = "arn:aws:s3:::mock" }
}
override_resource {
  target = aws_s3_bucket.state
  values = { arn = "arn:aws:s3:::mock" }
}
override_resource {
  target = aws_s3_bucket_lifecycle_configuration.cloudtrail
}
override_resource {
  target = aws_s3_bucket_lifecycle_configuration.state
}
override_resource {
  target = aws_s3_bucket_ownership_controls.cloudtrail
}
override_resource {
  target = aws_s3_bucket_ownership_controls.state
}
override_resource {
  target = aws_s3_bucket_policy.cloudtrail
}
override_resource {
  target = aws_s3_bucket_policy.state
}
override_resource {
  target = aws_s3_bucket_public_access_block.cloudtrail
}
override_resource {
  target = aws_s3_bucket_public_access_block.state
}
override_resource {
  target = aws_s3_bucket_server_side_encryption_configuration.cloudtrail
}
override_resource {
  target = aws_s3_bucket_server_side_encryption_configuration.state
}
override_resource {
  target = aws_s3_bucket_versioning.cloudtrail
}
override_resource {
  target = aws_s3_bucket_versioning.state
}
run "as_applied_a04723a" {
  command   = apply
  state_key = "bootstrap"
  module {
    source = "../old"
  }
}
run "main_plan" {
  command   = plan
  state_key = "bootstrap"
}
