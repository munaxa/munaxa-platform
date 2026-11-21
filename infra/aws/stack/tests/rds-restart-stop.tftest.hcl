# Testing RDS restart stop (rds-restart-stop.tf, report 2026-11-21-autonomous-security-and-testing-
# readiness file 06): plan-only tests with the mocked AWS provider, no credentials and no AWS call.
# The state machine logic is tested offline by rds-restart-stop/test_rds_restart_stop.py.
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

variables {
  environment = "nonprod"
  account_id  = "229251310592"
  vpc_cidr    = "10.130.0.0/16"
  hosts = {
    identity    = "id.test.munaxa.com"
    control_api = "control-api.test.munaxa.com"
    operator    = "operator.test.munaxa.com"
    work        = "work.test.munaxa.com"
    school      = "school.test.munaxa.com"
  }
  certificate_domains = ["*.test.munaxa.com"]

  # What a session that runs Identity, Work and Control needs (variables.tf validations). Public
  # test values: the keys are syntactically PEM only, never used to verify anything here.
  valkey_image                     = "public.ecr.aws/valkey/valkey@sha256:5555555555555555555555555555555555555555555555555555555555555555"
  identity_signing_kid             = "identity-test-2026-11"
  identity_public_keys             = "[{\"kid\":\"identity-test-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  control_licence_kid              = "control-test-2026-11"
  control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----"
  control_operator_organisation_id = "00000000-0000-0000-0000-000000000001"
  control_operator_subjects        = ["00000000-0000-0000-0000-000000000002"]
}


run "merging_the_restart_stop_changes_no_nonprod_plan" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
    session_cleanup_enabled   = true
  }

  override_resource {
    target          = aws_sns_topic.session_cleanup_alerts[0]
    override_during = plan
    values          = { arn = "arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts" }
  }

  assert {
    condition = (
      length(aws_sfn_state_machine.rds_restart_stop) == 0 && length(aws_iam_role.rds_restart_stop) == 0 &&
      length(aws_iam_role_policy.rds_restart_stop) == 0 && length(aws_iam_role.rds_restart_stop_events) == 0 &&
      length(aws_iam_role_policy.rds_restart_stop_events) == 0 && length(aws_cloudwatch_event_rule.rds_restart_stop) == 0 &&
      length(aws_cloudwatch_event_target.rds_restart_stop) == 0 && length(aws_cloudwatch_metric_alarm.rds_restart_stop_failed) == 0
    )
    error_message = "With rds_restart_stop_enabled unset nothing of the restart stop exists."
  }
  assert {
    condition     = [for s in jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement : s.Sid] == ["CloudWatchAlarmsOfThisAccount", "TlsOnly"]
    error_message = "With rds_restart_stop_enabled unset the alerts topic policy keeps exactly its applied statements."
  }
}

run "the_restart_stop_needs_the_session_cleanup" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
    rds_restart_stop_enabled  = true
  }

  expect_failures = [var.rds_restart_stop_enabled]
}

run "the_restart_stop_never_exists_in_prod" {
  command = plan

  variables {
    environment               = "prod"
    valkey_image              = ""
    session_backstop_schedule = "cron(0 21 * * ? *)"
    rds_restart_stop_enabled  = true
  }

  expect_failures = [var.rds_restart_stop_enabled]
}

run "enabled_restart_stop_is_scoped" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
    session_cleanup_enabled   = true
    rds_restart_stop_enabled  = true
  }

  override_resource {
    target          = aws_db_instance.main
    override_during = plan
    values = {
      arn                = "arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"
      identifier         = "munaxa-nonprod-pg"
      address            = "munaxa-nonprod-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
  override_resource {
    target          = aws_ecs_cluster.main
    override_during = plan
    values          = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod", name = "munaxa-nonprod" }
  }
  override_resource {
    target          = aws_iam_role.rds_restart_stop[0]
    override_during = plan
    values          = { id = "munaxa-nonprod-rds-restart-stop", arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-rds-restart-stop" }
  }
  override_resource {
    target          = aws_iam_role.rds_restart_stop_events[0]
    override_during = plan
    values          = { id = "munaxa-nonprod-rds-restart-stop-events", arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-rds-restart-stop-events" }
  }
  override_resource {
    target          = aws_sfn_state_machine.rds_restart_stop[0]
    override_during = plan
    values          = { arn = "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-rds-restart-stop" }
  }
  override_resource {
    target          = aws_sns_topic.session_cleanup_alerts[0]
    override_during = plan
    values          = { arn = "arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts" }
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.rds_restart_stop[0].event_pattern).detail.EventID == ["RDS-EVENT-0154"] && jsondecode(aws_cloudwatch_event_rule.rds_restart_stop[0].event_pattern).resources == ["arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"]
    error_message = "The rule matches only RDS-EVENT-0154 on the nonprod instance."
  }
  assert {
    condition = toset(flatten([for s in jsondecode(aws_iam_role_policy.rds_restart_stop[0].policy).Statement : s.Effect == "Allow" ? flatten([s.Action]) : tolist([])])) == toset([
      "rds:DescribeDBInstances", "rds:StopDBInstance", "ecs:ListTasks", "scheduler:ListSchedules", "secretsmanager:DescribeSecret",
    ])
    error_message = "The state machine role allows exactly the five actions the definition calls (test_rds_restart_stop.py ALLOWED)."
  }
  assert {
    condition     = [for s in jsondecode(aws_iam_role_policy.rds_restart_stop[0].policy).Statement : s.Resource if s.Sid == "ThisDatabaseOnly"][0] == "arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"
    error_message = "Stop and describe only the nonprod database."
  }
  assert {
    condition     = contains([for s in jsondecode(aws_iam_role_policy.rds_restart_stop[0].policy).Statement : s.Sid if s.Effect == "Deny"], "NeverASecretValue")
    error_message = "The role can never read a secret value."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.rds_restart_stop[0].definition).States.WaitForRotation.Seconds == 7200 && jsondecode(aws_sfn_state_machine.rds_restart_stop[0].definition).States.ReadPSchedules.Parameters.NamePrefix == "munaxa-nonprod-session-cleanup-p-"
    error_message = "Waits 2 hours and guards on the H-20 P/S schedule names."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.rds_restart_stop_events[0].policy).Statement[0].Resource == "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-rds-restart-stop" && aws_cloudwatch_event_target.rds_restart_stop[0].arn == "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-rds-restart-stop"
    error_message = "EventBridge starts only this state machine."
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.rds_restart_stop_failed) == 1
    error_message = "A failed execution raises the alarm."
  }
  # The alarm's name is not under munaxa-nonprod-session-cleanup-*, so the topic policy must admit it
  # by name, or CloudWatch could not publish its notification.
  assert {
    condition = (
      aws_cloudwatch_metric_alarm.rds_restart_stop_failed[0].alarm_name == "munaxa-nonprod-rds-restart-stop-failed" &&
      [for s in jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement : s.Sid] == ["CloudWatchAlarmsOfThisAccount", "TlsOnly", "RdsRestartStopAlarm"] &&
      [for s in jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement : s.Condition.ArnLike["aws:SourceArn"] if s.Sid == "RdsRestartStopAlarm"] == ["arn:aws:cloudwatch:eu-central-1:229251310592:alarm:munaxa-nonprod-rds-restart-stop-failed"] &&
      [for s in jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement : s.Action if s.Sid == "RdsRestartStopAlarm"] == ["sns:Publish"]
    )
    error_message = "The alerts topic admits the restart stop alarm, by its exact name, for sns:Publish only."
  }
}
