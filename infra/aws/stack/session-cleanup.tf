# --- Testing: independent session cleanup (nonprod only, OFF by default) ---------------------------
#
# Stage E blocker BE-2 (report 2026-11-14-identity-stage-e-blockers-remediation, file 02), built from
# the merged design of PR #90 (2026-11-11-identity-independent-cleanup-design, option 3, revision 2).
#
# What it closes: backstop.tf stops the database and scales services to 0 at 21:00 UTC, but it
# cannot delete the ALB (its ARN changes every session and a schedule's input is fixed), and it never
# deletes the one-run bootstrap secret. If Claude loses control of a session and every scheduled
# `down` is dropped, the ALB keeps costing about US$0.89 a day with no limit. This state machine runs
# inside AWS, finds the ALB by its fixed name, and needs nobody's session to stay open.
#
#   - Step Functions Standard state machine munaxa-nonprod-session-cleanup (session-cleanup/
#     definition.asl.json), four independent branches, each catching its own errors:
#       secret   the one-run bootstrap secret, by exact name, force-deleted (never identity-operator)
#       alb      the ALB named munaxa-nonprod, deleted only if it is the internet-facing application
#                load balancer in this stack's VPC, then polled until it is gone
#       ecs      every nonprod service scaled to 0, every running task in the cluster stopped
#       database the nonprod database stopped (waits out starting/backing-up/modifying, 10 tries)
#     SUCCEEDED only when every branch reports ok; otherwise FAILED (CleanupIncomplete) with a cause
#     listing component statuses and AWS error names (never a value). TimeoutSeconds 900.
#   - Input {"dryRun": true} reports what it would do and changes nothing; {"dryRun": false} acts.
#     Anything else fails at once (BadInput) with nothing changed.
#   - One recurring schedule here (R, 21:05 UTC daily, dryRun false), run by the existing backstop
#     scheduler role. The per-session one-time schedules P (at the hard stop H) and S (H + 30 min) are
#     created by the operator before `up` (gate H-20) and delete themselves after firing; they are
#     not Terraform resources (README "Every configuration PR needs its own apply").
#   - Two alarms on an unencrypted SNS topic (alarm names and states only): any FAILED, TIMED_OUT or
#     ABORTED execution, and no SUCCEEDED execution in 24 hours (R itself broken). The owner's email
#     subscription is created outside Terraform, never in this public repository.
#
# Scope: only names this stack gives nonprod (cluster munaxa-nonprod, ALB munaxa-nonprod, database
# munaxa-nonprod-pg, secret munaxa-nonprod/identity-bootstrap). The role's own policy, an explicit
# deny on every other secret and on every prod name, and the nonprod workload boundary each limit it.
# It exists only in nonprod and only when session_cleanup_enabled is true (variables.tf), so merging
# this file changes no plan; enabling it is a configuration PR with its own owner-approved apply,
# after the bootstrap apply that widens the boundary and the deployer (bootstrap testing_session_cleanup).

locals {
  session_cleanup_enabled = local.backstop_enabled && var.session_cleanup_enabled
  session_cleanup_name    = "${local.prefix}-session-cleanup"
  session_cleanup_sm_arn  = "arn:aws:states:${var.region}:${var.account_id}:stateMachine:${local.session_cleanup_name}"

  # Exactly the services backstop.tf scales in (and the ten modules/service names).
  session_cleanup_services = ["identity", "control-api", "control-portal", "work-api", "work-admin", "school-api", "school-admin", "docs-api", "docs-web", "docs-scanner"]

  session_cleanup_definition = templatefile("${path.module}/session-cleanup/definition.asl.json", {
    cluster          = local.prefix
    services         = jsonencode(local.session_cleanup_services)
    alb_name         = local.prefix
    alb_arn_pattern  = "arn:aws:elasticloadbalancing:${var.region}:${var.account_id}:loadbalancer/app/${local.prefix}/*"
    vpc_id           = aws_vpc.main.id
    db_identifier    = "${local.prefix}-pg"
    bootstrap_secret = "${local.prefix}/identity-bootstrap"
    # Choice StringMatches knows only `*` (`?` would be six literal question marks; fix-check
    # finding N-2). The exact-name filter before it already excludes a longer name.
    bootstrap_secret_arn_pattern = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap-*"
  })
}

resource "aws_iam_role" "session_cleanup" {
  count = local.session_cleanup_enabled ? 1 : 0

  name                 = local.session_cleanup_name
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
        ArnLike      = { "aws:SourceArn" = local.session_cleanup_sm_arn }
      }
    }]
  })
}

resource "aws_iam_role_policy" "session_cleanup" {
  count = local.session_cleanup_enabled ? 1 : 0

  name = "clean-up-testing"
  role = aws_iam_role.session_cleanup[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BootstrapSecretOnly"
        Effect   = "Allow"
        Action   = "secretsmanager:DeleteSecret"
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap-??????"
      },
      {
        # Defence in depth: whatever an allow above or a later edit says, no other secret (above all
        # the persistent munaxa-nonprod/identity-operator) can be deleted, and no value is ever read.
        Sid         = "NeverAnotherSecret"
        Effect      = "Deny"
        Action      = "secretsmanager:DeleteSecret"
        NotResource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap-??????"
      },
      {
        Sid      = "NeverASecretValue"
        Effect   = "Deny"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret"]
        Resource = "*"
      },
      {
        # Names and metadata only (never a value). Listed rather than described, so an absent secret
        # is an empty list (review finding C-5); ListSecrets has no resource-level permission.
        Sid      = "FindTheSecret"
        Effect   = "Allow"
        Action   = "secretsmanager:ListSecrets"
        Resource = "*"
      },
      {
        Sid      = "FindTheAlb"
        Effect   = "Allow"
        Action   = "elasticloadbalancing:DescribeLoadBalancers"
        Resource = "*"
      },
      {
        # The ARN names the stack's ALB; the tags are the ones default_tags puts on it.
        Sid      = "DeleteOnlyTheNonprodAlb"
        Effect   = "Allow"
        Action   = "elasticloadbalancing:DeleteLoadBalancer"
        Resource = "arn:aws:elasticloadbalancing:${var.region}:${var.account_id}:loadbalancer/app/${local.prefix}/*"
        Condition = {
          StringEquals = { "aws:ResourceTag/Project" = "munaxa", "aws:ResourceTag/Environment" = var.environment }
        }
      },
      {
        Sid      = "ScaleInTheServices"
        Effect   = "Allow"
        Action   = ["ecs:DescribeServices", "ecs:UpdateService"]
        Resource = "arn:aws:ecs:${var.region}:${var.account_id}:service/${local.prefix}/*"
      },
      {
        Sid       = "FindAndStopTheTasks"
        Effect    = "Allow"
        Action    = ["ecs:ListTasks", "ecs:StopTask"]
        Resource  = "*"
        Condition = { ArnEquals = { "ecs:cluster" = "arn:aws:ecs:${var.region}:${var.account_id}:cluster/${local.prefix}" } }
      },
      {
        Sid      = "StopTheDatabase"
        Effect   = "Allow"
        Action   = ["rds:DescribeDBInstances", "rds:StopDBInstance"]
        Resource = "arn:aws:rds:${var.region}:${var.account_id}:db:${local.prefix}-pg"
      },
      {
        Sid    = "NeverProduction"
        Effect = "Deny"
        Action = "*"
        Resource = [
          "arn:aws:secretsmanager:*:*:secret:munaxa-prod*",
          "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/munaxa-prod*",
          "arn:aws:ecs:*:*:service/munaxa-prod*",
          "arn:aws:ecs:*:*:task/munaxa-prod*",
          "arn:aws:ecs:*:*:cluster/munaxa-prod*",
          "arn:aws:rds:*:*:db:munaxa-prod*",
        ]
      },
    ]
  })
}

resource "aws_sfn_state_machine" "session_cleanup" {
  count = local.session_cleanup_enabled ? 1 : 0

  name       = local.session_cleanup_name
  type       = "STANDARD"
  role_arn   = aws_iam_role.session_cleanup[0].arn
  definition = local.session_cleanup_definition

  lifecycle {
    precondition {
      condition     = var.environment == "nonprod"
      error_message = "The session cleanup exists only in nonprod."
    }
  }
}

# R: the daily attempt, after the 21:00 UTC backstop, and a daily proof that the role, the schedule
# and the read paths work (gate H-20 reads its last execution).
resource "aws_scheduler_schedule" "session_cleanup_daily" {
  count = local.session_cleanup_enabled ? 1 : 0

  name                         = "${local.session_cleanup_name}-daily"
  description                  = "Testing cleanup R: run the session cleanup state machine (dryRun false) every day"
  schedule_expression          = var.session_cleanup_schedule
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sfn_state_machine.session_cleanup[0].arn
    role_arn = aws_iam_role.session_backstop[0].arn
    input    = jsonencode({ dryRun = false })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}

# Alarm notifications only (alarm names and states). Unencrypted: an SSE topic would need the data
# key policy to admit CloudWatch, a further key-policy change for no confidential content.
resource "aws_sns_topic" "session_cleanup_alerts" {
  count = local.session_cleanup_enabled ? 1 : 0

  name = "${local.session_cleanup_name}-alerts"
}

resource "aws_sns_topic_policy" "session_cleanup_alerts" {
  count = local.session_cleanup_enabled ? 1 : 0

  arn = aws_sns_topic.session_cleanup_alerts[0].arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudWatchAlarmsOfThisAccount"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.session_cleanup_alerts[0].arn
        Condition = {
          StringEquals = { "aws:SourceAccount" = var.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:cloudwatch:${var.region}:${var.account_id}:alarm:${local.session_cleanup_name}-*" }
        }
      },
      {
        Sid       = "TlsOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["sns:Publish", "sns:Subscribe"]
        Resource  = aws_sns_topic.session_cleanup_alerts[0].arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "session_cleanup_failed" {
  count = local.session_cleanup_enabled ? 1 : 0

  alarm_name          = "${local.session_cleanup_name}-failed"
  alarm_description   = "A Testing session cleanup execution FAILED, TIMED_OUT or was ABORTED: something may still be running. Read the execution, then run aws-session.yml down."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.session_cleanup_alerts[0].arn]

  metric_query {
    id          = "problems"
    expression  = "FILL(failed, 0) + FILL(timedout, 0) + FILL(aborted, 0)"
    label       = "Failed, timed-out or aborted executions"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = { failed = "ExecutionsFailed", timedout = "ExecutionsTimedOut", aborted = "ExecutionsAborted" }
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/States"
        metric_name = metric_query.value
        dimensions  = { StateMachineArn = aws_sfn_state_machine.session_cleanup[0].arn }
        period      = 300
        stat        = "Sum"
      }
    }
  }
}

# The heartbeat: R runs every day, so a day without a SUCCEEDED execution means the schedule, the
# role or the state machine is broken. Missing data is breaching. Hourly periods, alarm only when all
# 26 of the last 26 hours had no success (owner review A-7: one 24-hour period would flap with R's
# finishing time and the metric's delay).
resource "aws_cloudwatch_metric_alarm" "session_cleanup_not_run" {
  count = local.session_cleanup_enabled ? 1 : 0

  alarm_name          = "${local.session_cleanup_name}-not-run"
  alarm_description   = "No Testing session cleanup execution SUCCEEDED in 26 hours: the daily run R is broken, so the independent cleanup cannot be relied on. Gate H-20 blocks the next session."
  namespace           = "AWS/States"
  metric_name         = "ExecutionsSucceeded"
  dimensions          = { StateMachineArn = aws_sfn_state_machine.session_cleanup[0].arn }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 26
  datapoints_to_alarm = 26
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.session_cleanup_alerts[0].arn]
}
