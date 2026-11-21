# L-5 (report 2026-11-12-docs-migration-security-hardening): the docs-migrate bundle, which holds
# the owner credential, follows hosts.docs, not the Docs images. Applied runs against a mocked AWS
# provider (no credentials, no AWS call), in order, so each run starts from the state the previous
# one left: the transitions an operator makes, and what each one creates or deletes.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/mock-AbCdEf" }
  }
  mock_resource "aws_sfn_state_machine" {
    defaults = { arn = "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/mock/0123456789abcdef" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:listener/app/mock/0123456789abcdef/0123456789abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:targetgroup/mock/0123456789abcdef" }
  }
  mock_resource "aws_acm_certificate" {
    defaults = { arn = "arn:aws:acm:eu-central-1:229251310592:certificate/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::munaxa-nonprod-mock-229251310592" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-00000000da7a" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/mock" }
  }
  override_resource {
    target = aws_db_instance.main
    values = {
      address            = "munaxa-test-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
}

# The ephemeral read of the Identity cache's AUTH token (identity-cache.tf). Terraform's provider
# mocks reject ephemeral resources, so its provider alias is a real provider that cannot reach AWS
# (fake keys, no account lookup, every endpoint used by the module on 127.0.0.1), and the module is
# replaced, so it never opens the secret. The value is a public placeholder, never a real token.
provider "aws" {
  alias                       = "ephemeral_secrets"
  region                      = "eu-central-1"
  access_key                  = "mock-access-key"
  secret_key                  = "mock-secret-key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  endpoints {
    secretsmanager = "http://127.0.0.1:9"
    sts            = "http://127.0.0.1:9"
    iam            = "http://127.0.0.1:9"
  }
}

override_module {
  target  = module.identity_cache_auth
  outputs = { value = "mock-placeholder-not-a-token-0123456789" }
}

# Baseline: envs/nonprod.tfvars as on main (passed with -var-file), applied into mocked state.
run "baseline_main" {
}

# Docs D-1: the Docs images pinned (placeholder digests), services off, Docs desired counts 0.
run "docs_d1_images_services_off" {
  command = plan
  variables {
    images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874"
    docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
  }
}

# Docs D-2: the same, with docs-api/web/scanner desired 1, as a session (edge and services on).
run "docs_d2_session_up" {
  command = plan
  variables {
    edge_enabled     = true
    services_enabled = true
    images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874"
    docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
    desired_counts = {
      identity = 1, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 1, docs-web = 1, docs-scanner = 1
    }
  }
}
