# Testing RDS restart stop (option C of report 2026-11-21-autonomous-pr-integration-and-testing-
# readiness file 01; built in 2026-11-21-autonomous-security-and-testing-readiness file 06).
# Nonprod only, OFF by default (var.rds_restart_stop_enabled): merging this changes no plan.
#
# Why: RDS starts a stopped database by itself after 7 days (RDS-EVENT-0154). The fixed 21:00 UTC
# backstop stops it only that evening, and the scheduled GitHub `down` runs hours late, so an
# auto-start in the morning runs the database for up to about 11 hours. A second fixed-time stop
# could stop the database before the overdue master-secret rotation (which fails hourly while the
# database is stopped) has run. This stops it a fixed time AFTER the auto-start instead:
#
#   EventBridge rule (RDS-EVENT-0154 on this one instance) -> Step Functions state machine:
#   wait 2 h (definition.asl.json: two hourly rotation attempts; on 20 Nov the rotation succeeded
#   15 minutes after the auto-start) -> read the database -> stop it ONLY if no
#   nonprod ECS task runs AND no H-20 P/S schedule exists (a session owns the database then) ->
#   record the secret's rotation metadata (DescribeSecret, never a value) -> StopDBInstance.
#
# Fail closed: any read it cannot interpret ends the execution FAILED without stopping anything; the
# 21:00 UTC backstop is unchanged and still runs. The logic is tested offline in
# rds-restart-stop/test_rds_restart_stop.py; the resources in tests/rds-restart-stop.tftest.hcl.
#
# Enabling it is an owner-approved infrastructure change in two steps (none is done by merging):
#   1. bootstrap (root): the nonprod workload boundary must allow scheduler:ListSchedules,
#      secretsmanager:DescribeSecret on the RDS master secret and states:StartExecution on this
#      state machine; the nonprod deployer needs events:* on the rule; the session-read role needs
#      the events read calls a refresh makes. Listed in the report; not in this change.
#   2. stack: rds_restart_stop_enabled = true in envs/nonprod.tfvars, plan, declaration, apply.
# Cost: inside the free tiers (a few state transitions and events a week).

locals {
  rds_restart_stop_enabled = var.rds_restart_stop_enabled && var.environment == "nonprod"
  rds_restart_stop_name    = "${local.prefix}-rds-restart-stop"
  rds_restart_stop_sm_arn  = "arn:aws:states:${var.region}:${var.account_id}:stateMachine:${local.rds_restart_stop_name}"
}

resource "aws_iam_role" "rds_restart_stop" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name                 = local.rds_restart_stop_name
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "states.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = var.account_id }
        ArnLike      = { "aws:SourceArn" = local.rds_restart_stop_sm_arn }
      }
    }]
  })
}

resource "aws_iam_role_policy" "rds_restart_stop" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name = "stop-an-auto-started-database"
  role = aws_iam_role.rds_restart_stop[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ThisDatabaseOnly"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances", "rds:StopDBInstance"]
        Resource = aws_db_instance.main.arn
      },
      {
        Sid       = "TasksOfThisCluster"
        Effect    = "Allow"
        Action    = "ecs:ListTasks"
        Resource  = "*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        # ListSchedules has no resource-level permission; it returns names and states only.
        Sid      = "SessionSchedules"
        Effect   = "Allow"
        Action   = "scheduler:ListSchedules"
        Resource = "*"
      },
      {
        Sid      = "RotationMetadata"
        Effect   = "Allow"
        Action   = "secretsmanager:DescribeSecret"
        Resource = aws_db_instance.main.master_user_secret[0].secret_arn
      },
      {
        Sid      = "NeverASecretValue"
        Effect   = "Deny"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret", "secretsmanager:RotateSecret"]
        Resource = "*"
      },
      {
        Sid      = "NeverStartOrChangeADatabase"
        Effect   = "Deny"
        Action   = ["rds:StartDBInstance", "rds:ModifyDBInstance", "rds:DeleteDBInstance", "rds:RebootDBInstance"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_sfn_state_machine" "rds_restart_stop" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name     = local.rds_restart_stop_name
  type     = "STANDARD"
  role_arn = aws_iam_role.rds_restart_stop[0].arn
  definition = templatefile("${path.module}/rds-restart-stop/definition.asl.json", {
    db_identifier     = aws_db_instance.main.identifier
    cluster           = aws_ecs_cluster.main.name
    cleanup_name      = local.session_cleanup_name
    master_secret_arn = aws_db_instance.main.master_user_secret[0].secret_arn
  })

  lifecycle {
    precondition {
      condition     = var.environment == "nonprod"
      error_message = "The RDS restart stop exists only in nonprod."
    }
  }
}

resource "aws_iam_role" "rds_restart_stop_events" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name                 = "${local.rds_restart_stop_name}-events"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "rds_restart_stop_events" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name = "start-the-restart-stop"
  role = aws_iam_role.rds_restart_stop_events[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "StartTheRestartStop"
      Effect   = "Allow"
      Action   = "states:StartExecution"
      Resource = aws_sfn_state_machine.rds_restart_stop[0].arn
    }]
  })
}

# RDS-EVENT-0154: "DB instance is being started due to it exceeding the maximum allowed time being
# stopped." Only for this one instance (resources), only that event id.
resource "aws_cloudwatch_event_rule" "rds_restart_stop" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  name        = local.rds_restart_stop_name
  description = "Testing: stop the nonprod database after RDS auto-starts it (7-day limit), once rotation had time to run"
  event_pattern = jsonencode({
    source        = ["aws.rds"]
    "detail-type" = ["RDS DB Instance Event"]
    resources     = [aws_db_instance.main.arn]
    detail        = { EventID = ["RDS-EVENT-0154"] }
  })
}

resource "aws_cloudwatch_event_target" "rds_restart_stop" {
  count = local.rds_restart_stop_enabled ? 1 : 0

  rule     = aws_cloudwatch_event_rule.rds_restart_stop[0].name
  arn      = aws_sfn_state_machine.rds_restart_stop[0].arn
  role_arn = aws_iam_role.rds_restart_stop_events[0].arn
}

# A failed or timed-out execution (a guard that failed closed) notifies the session cleanup topic.
resource "aws_cloudwatch_metric_alarm" "rds_restart_stop_failed" {
  count = local.rds_restart_stop_enabled && local.session_cleanup_enabled ? 1 : 0

  alarm_name          = "${local.rds_restart_stop_name}-failed"
  alarm_description   = "Testing RDS restart stop failed closed or timed out; the database may still run until the 21:00 UTC backstop"
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  dimensions          = { StateMachineArn = aws_sfn_state_machine.rds_restart_stop[0].arn }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.session_cleanup_alerts[0].arn]
}
