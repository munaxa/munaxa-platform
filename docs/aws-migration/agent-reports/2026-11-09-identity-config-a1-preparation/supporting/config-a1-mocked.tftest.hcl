# Config A1 (Identity only) mocked plans for the 2026-11-09 report identity-config-a1-preparation.
# NOT part of CI and NOT an AWS plan: a mocked AWS provider, no credentials, no AWS call. It proves
# nothing about AWS permissions; it lists the resource addresses the configuration produces.
#
# Unlike the 8 Nov file, the baseline is APPLIED into the test's own mocked state first, so the A1
# plan shows in-place updates and replacements of existing resources as well as creates.
#
# Run (from a scratch copy of infra/aws, with this file in stack/tests/):
#   terraform -chdir=stack init -backend=false
#   terraform -chdir=stack test -var-file=envs/nonprod.tfvars -verbose
#
# Image digests below are the real, verified ones (report section 3). The public key is a labelled
# TEST value: the owner's real one replaces it in envs/nonprod.tfvars (owner guide, step 2).

mock_provider "aws" {
  # Applying into mocked state needs well-formed ARNs where the provider validates them.
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/mock-AbCdEf" }
  }
  mock_resource "aws_acm_certificate" {
    defaults = { arn = "arn:aws:acm:eu-central-1:229251310592:certificate/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_acm_certificate_validation" {
    defaults = { certificate_arn = "arn:aws:acm:eu-central-1:229251310592:certificate/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/0000000000000000" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:targetgroup/mock/0000000000000000" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:listener/app/munaxa-nonprod/0000000000000000/0000000000000000" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/mock" }
  }
  # Policy documents are rendered by the provider; the mock returns a fixed, valid one.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  # The key policy names the control-api task role; give it an ARN at plan time.
  override_resource {
    target          = module.control_api[0].aws_iam_role.task[0]
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-test-control-api-task" }
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

run "baseline_live_g3_and_backstop" {
  command = apply
  assert {
    condition     = length(module.identity) == 0 && length(aws_ecs_task_definition.db_admin) == 0
    error_message = "The baseline is envs/nonprod.tfvars as on main: no product resource."
  }
}

run "config_a1_services_off" {
  command = plan
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820"
    }
    valkey_image          = "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
    identity_signing_kid  = "identity-nonprod-2026-11"
    identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nTEST-ONLY-NOT-A-REAL-KEY\\n-----END PUBLIC KEY-----\"}]"
    db_bootstrap_products = ["identity"]
    desired_counts = {
      identity   = 1, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 0, docs-web = 0, docs-scanner = 0
    }
  }
  assert {
    condition     = length(aws_ecs_task_definition.docs_db_admin) == 0 && length(module.control_api) == 0 && length(module.work_api) == 0 && length(module.school_api) == 0 && length(aws_kms_key.licence) == 0
    error_message = "Config A1 has no Docs task definition and no Control, Work or School resource."
  }
  assert {
    condition     = length(aws_lb.main) == 0 && module.identity[0].service_name == null
    error_message = "Config A1 is applied with the session down: no ALB, no ECS service."
  }
}

run "config_a1_applied" {
  command = apply
  variables {
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820"
    }
    valkey_image          = "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
    identity_signing_kid  = "identity-nonprod-2026-11"
    identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nTEST-ONLY-NOT-A-REAL-KEY\\n-----END PUBLIC KEY-----\"}]"
    db_bootstrap_products = ["identity"]
    desired_counts = {
      identity   = 1, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 0, docs-web = 0, docs-scanner = 0
    }
  }
}

# What aws-session.yml `up` would add on top of an applied A1 (not part of the A1 apply).
run "config_a1_session_up" {
  command = plan
  variables {
    edge_enabled     = true
    services_enabled = true
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820"
    }
    valkey_image          = "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
    identity_signing_kid  = "identity-nonprod-2026-11"
    identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nTEST-ONLY-NOT-A-REAL-KEY\\n-----END PUBLIC KEY-----\"}]"
    db_bootstrap_products = ["identity"]
    desired_counts = {
      identity   = 1, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 0, docs-web = 0, docs-scanner = 0
    }
  }
  assert {
    condition     = module.identity[0].service_name != null && length(aws_lb.main) == 1
    error_message = "A session runs Identity behind the ALB."
  }
}
