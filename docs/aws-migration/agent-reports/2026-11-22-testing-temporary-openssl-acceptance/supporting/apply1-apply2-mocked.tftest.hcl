# Apply 1 and Apply 2 of the first Docs Testing deployment (report 2026-11-21-testing-owner-preparation,
# file 06). Offline only: a mocked AWS provider, no credentials, no AWS call. Every digest, bundle
# version id and the licence public key are PLACEHOLDERS (e1/e2 Identity, c1/c2/c3 Control, d1-d4 Docs,
# 1111…/5555… version ids, a throwaway P-256 public key whose private half was never kept). The operator
# organisation and subject are the real Testing identifiers (not secrets; Stage E report).
# Each applied run starts from the state the previous one left.
#
#   cp <this file> infra/aws/stack/tests/ && cd infra/aws/stack && terraform init -backend=false \
#     && terraform test -verbose -var-file=envs/nonprod.tfvars -filter=tests/apply1-apply2-mocked.tftest.hcl

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

# main as it is now (envs/nonprod.tfvars): Identity 2db6ed9, MFA off, no Control, no Docs.
run "baseline_main" {
}

# APPLY 1, as the owner's plan shows it: Control C-1 images (services off, counts 0), the new
# Identity images and D-OP-1 (MFA privileged). No operator_access (Cloudflare Access not used).
run "apply1_plan" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
  }
}

run "apply1" {
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
  }
}

# APPLY 2, as the owner's plan shows it: Control C-2 (licence key, operator ids, control db-admin,
# Control bundle pins) and Docs D-1 (Docs images and Docs bundle pins), services still off.
run "apply2_plan" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
      docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1"
      docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2"
      docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3"
      docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
    control_licence_kid              = "control-licence-nonprod-2026-11"
    control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhP6T1Ezdma2p1ZDBJcd8Qwn+54Jp\nF16iUHJY6jFNLJTRcy9jq6LFWTd6zvU0HYpdd4y+LyrY/k6fK4fntQ5P5A==\n-----END PUBLIC KEY-----"
    control_operator_organisation_id = "071d3060-70ac-4017-9ff9-094ff715051e"
    control_operator_subjects        = ["ae62eef5-cf65-43c8-83e2-7786d2d5ae87"]
    db_bootstrap_products            = ["identity", "control"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      control-api      = "11111111-1111-4111-8111-111111111111"
      control-migrate  = "22222222-2222-4222-8222-222222222222"
      docs-api         = "33333333-3333-4333-8333-333333333333"
      docs-operator    = "44444444-4444-4444-8444-444444444444"
      docs-migrate     = "55555555-5555-4555-8555-555555555555"
    }
  }
}

run "apply2" {
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
      docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1"
      docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2"
      docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3"
      docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
    control_licence_kid              = "control-licence-nonprod-2026-11"
    control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhP6T1Ezdma2p1ZDBJcd8Qwn+54Jp\nF16iUHJY6jFNLJTRcy9jq6LFWTd6zvU0HYpdd4y+LyrY/k6fK4fntQ5P5A==\n-----END PUBLIC KEY-----"
    control_operator_organisation_id = "071d3060-70ac-4017-9ff9-094ff715051e"
    control_operator_subjects        = ["ae62eef5-cf65-43c8-83e2-7786d2d5ae87"]
    db_bootstrap_products            = ["identity", "control"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      control-api      = "11111111-1111-4111-8111-111111111111"
      control-migrate  = "22222222-2222-4222-8222-222222222222"
      docs-api         = "33333333-3333-4333-8333-333333333333"
      docs-operator    = "44444444-4444-4444-8444-444444444444"
      docs-migrate     = "55555555-5555-4555-8555-555555555555"
    }
  }
}

# The later Docs credential pin (runbook step 11): only the docs-api bundle version changes.
run "docs_credential_pin_plan" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
      docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1"
      docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2"
      docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3"
      docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
    control_licence_kid              = "control-licence-nonprod-2026-11"
    control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhP6T1Ezdma2p1ZDBJcd8Qwn+54Jp\nF16iUHJY6jFNLJTRcy9jq6LFWTd6zvU0HYpdd4y+LyrY/k6fK4fntQ5P5A==\n-----END PUBLIC KEY-----"
    control_operator_organisation_id = "071d3060-70ac-4017-9ff9-094ff715051e"
    control_operator_subjects        = ["ae62eef5-cf65-43c8-83e2-7786d2d5ae87"]
    db_bootstrap_products            = ["identity", "control"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      control-api      = "11111111-1111-4111-8111-111111111111"
      control-migrate  = "22222222-2222-4222-8222-222222222222"
      docs-api         = "66666666-6666-4666-8666-666666666666"
      docs-operator    = "44444444-4444-4444-8444-444444444444"
      docs-migrate     = "55555555-5555-4555-8555-555555555555"
    }
  }
}

# A Docs session plan (not applied): what `up` adds on top of Apply 2.
run "docs_session_plan" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1"
      control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
      docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1"
      docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2"
      docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3"
      docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
    control_licence_kid              = "control-licence-nonprod-2026-11"
    control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEhP6T1Ezdma2p1ZDBJcd8Qwn+54Jp\nF16iUHJY6jFNLJTRcy9jq6LFWTd6zvU0HYpdd4y+LyrY/k6fK4fntQ5P5A==\n-----END PUBLIC KEY-----"
    control_operator_organisation_id = "071d3060-70ac-4017-9ff9-094ff715051e"
    control_operator_subjects        = ["ae62eef5-cf65-43c8-83e2-7786d2d5ae87"]
    db_bootstrap_products            = ["identity", "control"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      control-api      = "11111111-1111-4111-8111-111111111111"
      control-migrate  = "22222222-2222-4222-8222-222222222222"
      docs-api         = "33333333-3333-4333-8333-333333333333"
      docs-operator    = "44444444-4444-4444-8444-444444444444"
      docs-migrate     = "55555555-5555-4555-8555-555555555555"
    }
    edge_enabled     = true
    services_enabled = true
    operator_cidrs   = ["198.51.100.7/32"]
    desired_counts = {
      identity = 1, control-api = 1, control-portal = 1, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 1, docs-web = 1, docs-scanner = 1
    }
  }
}
