provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  # Terraform runs as the shared deployer (bootstrap/), assumed by the GitHub Actions CI role with a
  # source identity, as Munaxa Docs does. Never root keys, never an IAM user.
  dynamic "assume_role" {
    for_each = var.deployer_role_arn == null ? [] : [1]
    content {
      role_arn        = var.deployer_role_arn
      session_name    = var.deployer_session_name
      source_identity = "github-actions"
    }
  }

  default_tags {
    tags = {
      Project     = "munaxa"
      Stack       = "shared"
      Environment = var.environment
      ManagedBy   = "terraform/munaxa-platform/infra/aws/stack"
    }
  }
}

# The same account, region and deployer as above, for one thing only: the ephemeral read of the
# Identity cache's AUTH token (identity-cache.tf, modules/secret-key-ephemeral). It is a separate
# configuration because Terraform's provider mocks reject ephemeral resources, so the mocked plan
# tests give this alias an offline provider (every endpoint 127.0.0.1) and replace the module.
# Keep every argument identical to the default provider's.
provider "aws" {
  alias = "ephemeral_secrets"

  region              = var.region
  allowed_account_ids = [var.account_id]

  dynamic "assume_role" {
    for_each = var.deployer_role_arn == null ? [] : [1]
    content {
      role_arn        = var.deployer_role_arn
      session_name    = var.deployer_session_name
      source_identity = "github-actions"
    }
  }

  default_tags {
    tags = {
      Project     = "munaxa"
      Stack       = "shared"
      Environment = var.environment
      ManagedBy   = "terraform/munaxa-platform/infra/aws/stack"
    }
  }
}
