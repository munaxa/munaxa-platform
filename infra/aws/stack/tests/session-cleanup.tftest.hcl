# Independent Testing session cleanup (session-cleanup.tf, Stage E blocker BE-2): plan-only tests with
# the mocked AWS provider, no credentials and no AWS call. The state machine logic itself is
# simulated offline by session-cleanup/test_session_cleanup.py.
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


run "merging_the_cleanup_changes_no_nonprod_plan" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
  }

  assert {
    condition = (
      length(aws_sfn_state_machine.session_cleanup) == 0 && length(aws_iam_role.session_cleanup) == 0 &&
      length(aws_iam_role_policy.session_cleanup) == 0 && length(aws_scheduler_schedule.session_cleanup_daily) == 0 &&
      length(aws_sns_topic.session_cleanup_alerts) == 0 && length(aws_sns_topic_policy.session_cleanup_alerts) == 0 &&
      length(aws_cloudwatch_metric_alarm.session_cleanup_failed) == 0 && length(aws_cloudwatch_metric_alarm.session_cleanup_not_run) == 0
    )
    error_message = "With session_cleanup_enabled unset nothing of the cleanup exists."
  }
}

run "the_backstop_policy_is_unchanged_while_the_cleanup_is_off" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
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
    values          = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" }
  }

  assert {
    condition     = length(jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement) == 2
    error_message = "The backstop role keeps exactly its two statements (no in-place update on merge)."
  }
}

run "the_cleanup_needs_nonprod_and_the_backstop" {
  command = plan

  variables {
    session_cleanup_enabled = true
  }

  expect_failures = [var.session_cleanup_enabled]
}

run "the_cleanup_never_exists_in_prod" {
  command = plan

  variables {
    environment               = "prod"
    valkey_image              = ""
    session_backstop_schedule = "cron(0 21 * * ? *)"
    session_cleanup_enabled   = true
  }

  expect_failures = [var.session_cleanup_enabled]
}

run "enabled_cleanup_is_scoped_and_complete" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
    session_cleanup_enabled   = true
  }

  override_resource {
    target          = aws_vpc.main
    override_during = plan
    values          = { id = "vpc-0123456789abcdef0", arn = "arn:aws:ec2:eu-central-1:229251310592:vpc/vpc-0123456789abcdef0" }
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
    values          = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" }
  }
  override_resource {
    target          = aws_iam_role.session_backstop[0]
    override_during = plan
    values          = { id = "munaxa-nonprod-session-backstop", arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-backstop" }
  }
  override_resource {
    target          = aws_iam_role.session_cleanup[0]
    override_during = plan
    values          = { id = "munaxa-nonprod-session-cleanup", arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-cleanup" }
  }
  override_resource {
    target          = aws_sfn_state_machine.session_cleanup[0]
    override_during = plan
    values          = { arn = "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup" }
  }
  override_resource {
    target          = aws_sns_topic.session_cleanup_alerts[0]
    override_during = plan
    values          = { arn = "arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts" }
  }

  # Exactly the declared creates, plus one in-place update of the backstop policy.
  assert {
    condition = (
      length(aws_sfn_state_machine.session_cleanup) == 1 && length(aws_iam_role.session_cleanup) == 1 &&
      length(aws_iam_role_policy.session_cleanup) == 1 && length(aws_scheduler_schedule.session_cleanup_daily) == 1 &&
      length(aws_sns_topic.session_cleanup_alerts) == 1 && length(aws_sns_topic_policy.session_cleanup_alerts) == 1 &&
      length(aws_cloudwatch_metric_alarm.session_cleanup_failed) == 1 && length(aws_cloudwatch_metric_alarm.session_cleanup_not_run) == 1
    )
    error_message = "Enabled, the cleanup is eight resources."
  }
  assert {
    condition     = aws_sfn_state_machine.session_cleanup[0].name == "munaxa-nonprod-session-cleanup" && aws_sfn_state_machine.session_cleanup[0].type == "STANDARD"
    error_message = "One Standard state machine with the fixed nonprod name."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).TimeoutSeconds == 900 && length(jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches) == 4
    error_message = "Fifteen minutes at most; four parallel branches."
  }
  assert {
    condition     = !strcontains(aws_sfn_state_machine.session_cleanup[0].definition, "$${") && strcontains(aws_sfn_state_machine.session_cleanup[0].definition, "\"vpc-0123456789abcdef0\"")
    error_message = "Every template value is filled in, including the stack's VPC id."
  }
  assert {
    condition = alltrue(flatten([for b in jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches : [
      for name, st in b.States : st.Type != "Task" || anytrue([for c in lookup(st, "Catch", []) : contains(c.ErrorEquals, "States.ALL")])
    ]]))
    error_message = "Every task of every branch catches every error itself, so one branch never cancels another."
  }
  assert {
    condition = alltrue(flatten([for b in jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches : [
      for name, st in b.States : st.Type != "Map" || alltrue([for n, inner in st.ItemProcessor.States : inner.Type != "Task" || anytrue([for c in lookup(inner, "Catch", []) : contains(c.ErrorEquals, "States.ALL")])])
    ]]))
    error_message = "Every task inside a Map catches every error itself too."
  }
  assert {
    condition = alltrue(flatten([for b in jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches : [
      for name, st in b.States : st.Type != "Task" || contains([
        "arn:aws:states:::aws-sdk:secretsmanager:describeSecret", "arn:aws:states:::aws-sdk:secretsmanager:deleteSecret",
        "arn:aws:states:::aws-sdk:elasticloadbalancingv2:describeLoadBalancers", "arn:aws:states:::aws-sdk:elasticloadbalancingv2:deleteLoadBalancer",
        "arn:aws:states:::aws-sdk:ecs:listTasks", "arn:aws:states:::aws-sdk:rds:describeDBInstances", "arn:aws:states:::aws-sdk:rds:stopDBInstance",
      ], st.Resource)
    ]]))
    error_message = "The branches call only the reviewed actions (no GetSecretValue, nothing else)."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches[0].States.SecretDescribe.Parameters.SecretId == "munaxa-nonprod/identity-bootstrap" && jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches[1].States.AlbDescribe.Parameters.Names == ["munaxa-nonprod"] && jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Cleanup.Branches[3].States.DbDescribe.Parameters.DbInstanceIdentifier == "munaxa-nonprod-pg"
    error_message = "The targets are the fixed nonprod names: the bootstrap secret (never identity-operator), the ALB and the database."
  }
  assert {
    condition     = jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Config.Parameters.services == ["identity", "control-api", "control-portal", "work-api", "work-admin", "school-api", "school-admin", "docs-api", "docs-web", "docs-scanner"]
    error_message = "The cleanup scales in exactly the services the backstop does."
  }
  assert {
    condition     = toset(jsondecode(aws_sfn_state_machine.session_cleanup[0].definition).States.Config.Parameters.services) == toset(local.backstop_services)
    error_message = "The cleanup and the backstop name the same services."
  }
  assert {
    condition     = aws_scheduler_schedule.session_cleanup_daily[0].schedule_expression == "cron(5 21 * * ? *)" && aws_scheduler_schedule.session_cleanup_daily[0].schedule_expression_timezone == "UTC" && jsondecode(aws_scheduler_schedule.session_cleanup_daily[0].target[0].input).dryRun == false
    error_message = "R runs at 21:05 UTC every day and acts (dryRun false)."
  }
  assert {
    condition     = aws_scheduler_schedule.session_cleanup_daily[0].target[0].role_arn == "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-backstop"
    error_message = "R runs with the existing backstop scheduler role."
  }
  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement :
      s.Sid == "StartTheSessionCleanup" && s.Action == "states:StartExecution" && s.Resource == "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"
    ]) && length(jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement) == 3
    error_message = "The backstop role gains exactly one statement: start this state machine."
  }
  assert {
    condition     = aws_iam_role.session_cleanup[0].permissions_boundary == "arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary" && aws_iam_role.session_cleanup[0].path == "/munaxa-shared/"
    error_message = "The cleanup role carries the nonprod workload boundary."
  }
  assert {
    condition = (
      jsondecode(aws_iam_role.session_cleanup[0].assume_role_policy).Statement[0].Principal.Service == "states.amazonaws.com" &&
      jsondecode(aws_iam_role.session_cleanup[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "229251310592" &&
      jsondecode(aws_iam_role.session_cleanup[0].assume_role_policy).Statement[0].Condition.ArnLike["aws:SourceArn"] == "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"
    )
    error_message = "Only this account's cleanup state machine can assume the role."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.session_cleanup[0].policy).Statement :
      s.Effect == "Deny" || alltrue([for r in flatten([s.Resource]) : r == "*" || strcontains(r, "munaxa-nonprod")])
    ])
    error_message = "Every allow names a nonprod resource, or is a read with no resource-level permission."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.session_cleanup[0].policy).Statement :
      s.Effect == "Deny" || alltrue([for a in flatten([s.Action]) : contains([
        "secretsmanager:DescribeSecret", "secretsmanager:DeleteSecret", "elasticloadbalancing:DescribeLoadBalancers",
        "elasticloadbalancing:DeleteLoadBalancer", "ecs:DescribeServices", "ecs:UpdateService", "ecs:ListTasks", "ecs:StopTask",
        "rds:DescribeDBInstances", "rds:StopDBInstance",
      ], a)])
    ])
    error_message = "The cleanup role is allowed only the ten reviewed actions."
  }
  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.session_cleanup[0].policy).Statement :
      s.Sid == "NeverAnotherSecret" && s.Effect == "Deny" && s.Action == "secretsmanager:DeleteSecret" && s.NotResource == "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap-??????"
    ]) && anytrue([for s in jsondecode(aws_iam_role_policy.session_cleanup[0].policy).Statement : s.Sid == "NeverASecretValue" && s.Effect == "Deny" && contains(s.Action, "secretsmanager:GetSecretValue")])
    error_message = "No secret but the bootstrap one can be deleted, and no secret value can be read."
  }
  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.session_cleanup[0].policy).Statement :
      s.Sid == "DeleteOnlyTheNonprodAlb" && s.Condition.StringEquals["aws:ResourceTag/Environment"] == "nonprod" && s.Condition.StringEquals["aws:ResourceTag/Project"] == "munaxa"
    ])
    error_message = "The ALB delete also needs the stack's tags."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.session_cleanup_failed[0].alarm_actions == toset(["arn:aws:sns:eu-central-1:229251310592:munaxa-nonprod-session-cleanup-alerts"]) && aws_cloudwatch_metric_alarm.session_cleanup_not_run[0].treat_missing_data == "breaching" && aws_cloudwatch_metric_alarm.session_cleanup_not_run[0].period == 86400
    error_message = "A failure notifies the alerts topic; a day without success alarms too."
  }
  assert {
    condition     = jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "229251310592" && jsondecode(aws_sns_topic_policy.session_cleanup_alerts[0].policy).Statement[1].Effect == "Deny"
    error_message = "Only this account's alarms publish, over TLS."
  }
}
