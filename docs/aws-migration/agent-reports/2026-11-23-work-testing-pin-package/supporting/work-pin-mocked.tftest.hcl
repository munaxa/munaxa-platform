# MW-002: the Work Testing pin (report 2026-11-23-work-testing-pin-package, file 01). Offline only: a
# mocked AWS provider, no credentials, no AWS call. The three Work digests (aaaa/bbbb/cccc) and the two
# Work bundle version ids (7777/8888) are PLACEHOLDERS; everything else comes from envs/nonprod.tfvars
# as of d2e6fcf (the images and secret_version_ids maps are repeated here because a run's variables
# replace a whole map). Services stay off (services_enabled = false, desired_counts work-* = 0).
#
#   cp <this file> infra/aws/stack/tests/ && cd infra/aws/stack && terraform init -backend=false \
#     && terraform test -verbose -var-file=envs/nonprod.tfvars -filter=tests/work-pin-mocked.tftest.hcl

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

# main as it is now (envs/nonprod.tfvars): Identity, Control and Docs pinned, no Work.
run "baseline_main" {
}

# The pin PR, as the owner's plan shows it: Work images, Work bundle pins, work in db-admin.
run "work_pin_plan" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:b69d9481e43269b5061e3f70a421a41b007bac0d3a0e17b49f8906fe78fd4caa"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:f44593fa3f0021eb301f9270849cc7498012247b50cbf8a5e8dc586f14616462"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:6c79f98ede5159aabae316ad2f29c5e85b99e6bc011265a16da4d75fb44f88f0"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:0ae0db81a6c1eb07068f8bb330379664f15ec3d4cbcadc519cf968082da723a9"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:752fea31c1f0ac6dbcdffc0d5d1bfcd0348eb84e5f7008aad77f645275f64ca6"
      docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:febeaca7bb1e58b261677c30cc4aabeec7d00896b40155f89ead903597be073d"
      docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:28e22b96ada6237abef4f53470c1d13723bb70931ae8dfa774df8d536cbb48cd"
      docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:801c77e1560ec63430463346810c83527a5183982e94cc82950cbbed3f015dfc"
      docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:4d00650b9759a64889cf2c95a3c10cb508787737af2d69aff64c23ba56e66ae8"
      work_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      work_admin       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      work_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
    db_bootstrap_products = ["identity", "control", "work"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      control-api      = "655501d8-19f2-4190-9460-960b6464a1a2"
      control-migrate  = "ee66de8e-9ab8-4f72-8db8-11c631c1e0e0"
      docs-api         = "b6ea4c3a-31ae-4d01-a4b7-7941f01e53a7"
      docs-operator    = "85c17e64-1cec-4edd-80a2-59c5c06306d5"
      docs-migrate     = "b9b569c4-c9d7-49ae-935f-a59ee4da6a14"
      work-api         = "77777777-7777-4777-8777-777777777777"
      work-migrate     = "88888888-8888-4888-8888-888888888888"
    }
  }

  assert {
    condition     = module.work_api[0].service_name == null && module.work_admin[0].service_name == null
    error_message = "The pin must create no Work ECS service."
  }
  assert {
    condition     = !var.services_enabled && var.desired_counts["work-api"] == 0 && var.desired_counts["work-admin"] == 0
    error_message = "Services stay off and Work's desired counts stay 0."
  }
}
