# Config A1 inputs-PR mocked test (report 2026-11-10-identity-config-a1-continuation). NOT part of CI and
# NOT an AWS plan. Run from infra/aws/stack with this file copied into tests/:
#   terraform test -var-file=envs/nonprod.tfvars -filter=tests/config-a1-inputs-mocked.tftest.hcl -verbose

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

# Inputs-PR check: the baseline is main BEFORE this PR (A1 inputs blanked); the next runs use
# envs/nonprod.tfvars exactly as in this PR (no variable overrides), i.e. the owner's real public key
# and version ids. Mocked provider: not an AWS plan, proves nothing about AWS permissions.
run "baseline_before_inputs" {
  command = apply
  variables {
    images                = {}
    valkey_image          = ""
    postgres_image        = ""
    db_bootstrap_products = []
    identity_signing_kid  = ""
    identity_public_keys  = "[]"
    secret_version_ids    = {}
    desired_counts = {
      identity   = 1, control-api = 1, control-portal = 1, work-api = 1, work-admin = 1,
      school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
    }
  }
  assert {
    condition     = length(module.identity) == 0 && length(aws_ecs_task_definition.db_admin) == 0
    error_message = "Baseline must hold no product resource."
  }
}

run "inputs_pr_services_off" {
  command = plan
  assert {
    condition     = length(module.identity) == 1 && length(aws_ecs_task_definition.db_admin) == 1 && length(aws_ecs_task_definition.docs_db_admin) == 0
    error_message = "A1 must register Identity and db-admin, and no docs_db_admin."
  }
  assert {
    condition     = length(module.control_api) == 0 && length(module.control_portal) == 0 && length(module.work_api) == 0 && length(module.work_admin) == 0 && length(module.school_api) == 0 && length(module.school_admin) == 0
    error_message = "No Control, Work or School resource in A1."
  }
}

run "inputs_pr_session_up" {
  command = plan
  variables {
    edge_enabled     = true
    services_enabled = true
  }
}
