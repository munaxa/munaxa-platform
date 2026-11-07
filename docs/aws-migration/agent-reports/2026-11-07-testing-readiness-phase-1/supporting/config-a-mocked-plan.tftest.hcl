# Config A check used by the 2026-11-07 testing readiness phase 1 report (not part of CI).
# Plan-only with the stack's mocked AWS provider: no credentials, no AWS call. Placeholder digests,
# Access values and keys are fake. To run: copy into infra/aws/stack/tests/ in a scratch copy, then
#   terraform init -backend=false && terraform test -var-file=envs/nonprod.tfvars -filter=tests/config-a-mocked-plan.tftest.hcl
# Result at 3337809 (Terraform 1.16.5, AWS provider 6.67.0): 5 passed, 0 failed.

# Plan-only tests with a mocked AWS provider: no credentials, no AWS call. They check the shape of
# each stage and that the guardrails refuse what they must.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
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

variables {
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:4444444444444444444444444444444444444444444444444444444444444444"
    control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:5555555555555555555555555555555555555555555555555555555555555555"
  }
  valkey_image          = "public.ecr.aws/valkey/valkey@sha256:6666666666666666666666666666666666666666666666666666666666666666"
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:7777777777777777777777777777777777777777777777777777777777777777"
  operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  identity_signing_kid  = "identity-nonprod-2026-11"
  identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  db_bootstrap_products = ["identity", "control"]
  desired_counts = {
    identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1,
    school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
  }
}

run "config_a_services_off" {
  command = plan
  assert {
    condition     = length(aws_kms_key.licence) == 1 && length(module.identity) == 1 && length(module.control_api) == 1 && length(module.control_portal) == 1 && length(module.control_migrate) == 1 && length(module.migrate) == 1 && length(aws_ecs_task_definition.db_admin) == 1 && length(aws_ecs_task_definition.identity_bootstrap) == 1
    error_message = "Config A shape"
  }
  assert {
    condition     = length(module.work_api) == 0 && length(aws_lb.main) == 0 && length(aws_secretsmanager_secret.service) == 10
    error_message = "no work, no edge, 10 bundles unchanged"
  }
  assert {
    condition     = keys(module.migrate) == ["identity"] && length(aws_kms_alias.licence) == 1 && length(aws_scheduler_schedule.control_sweep) == 0
    error_message = "identity-migrate through module.migrate, control-migrate on its own; licence alias; no sweep in nonprod"
  }
}

run "config_a_session_up_control_at_zero" {
  command = plan
  variables {
    edge_enabled     = true
    services_enabled = true
  }
  assert {
    condition     = length(aws_lb.main) == 1
    error_message = "edge"
  }
}

run "config_a_without_operator_access_refused" {
  command = plan
  variables { operator_access = null }
  expect_failures = [var.operator_access]
}

run "config_a_session_without_valkey_refused" {
  command = plan
  variables {
    services_enabled = true
    valkey_image     = ""
  }
  expect_failures = [var.valkey_image]
}

run "config_a_session_control_above_zero_refused" {
  command = plan
  variables {
    services_enabled = true
    desired_counts   = { identity = 1, control-api = 1, control-portal = 0, work-api = 1, work-admin = 1, school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1 }
  }
  expect_failures = [var.control_licence_public_key]
}
