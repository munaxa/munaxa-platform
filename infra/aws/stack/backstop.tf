# Testing's AWS-side shutdown backstop (phase 6, Agent 5). Nonprod only.
#
# aws-session.yml `down` is the normal end of a session, and its schedule is the first backstop.
# GitHub starts scheduled runs late (3 to 6 hours observed), can drop them under load, disables them
# in a public repository after 60 days without activity, and queues them behind any nonprod run that
# waits for an approval. This one runs inside AWS at a fixed time whatever GitHub does:
#
#   - rds:StopDBInstance on the nonprod database
#   - ecs:UpdateService desiredCount 0 on every nonprod service
#
# It cannot delete the ALB: DeleteLoadBalancer needs the ALB's ARN, which changes with every
# session, and a schedule's input is fixed. The ALB (about US$0.037 an hour with its two IPv4
# addresses) is removed by the next `down`. A call on a stopped database or a missing service fails
# harmlessly (InvalidDBInstanceState, ServiceNotFoundException); nothing is retried for long.
#
# Drift it leaves: a scaled-in service shows desired_count 0 -> n in the next `up` plan (an
# aws_ecs_service update, which the session plan check allows); `down` deletes the services anyway.
# Schedules carry no tags (the API has none). Cost: about 11 invocations a day, inside the
# EventBridge Scheduler free tier of 14 million a month.

locals {
  backstop_enabled = var.environment == "nonprod" && var.session_backstop_schedule != ""
  # Every long-running service the stack can create (modules/service var.name, create_service).
  backstop_services = local.backstop_enabled ? toset([
    "identity", "control-api", "control-portal", "work-api", "work-admin", "school-api", "school-admin",
    "docs-api", "docs-web", "docs-scanner",
  ]) : toset([])
}

resource "aws_iam_role" "session_backstop" {
  count = local.backstop_enabled ? 1 : 0

  name                 = "${local.prefix}-session-backstop"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "session_backstop" {
  count = local.backstop_enabled ? 1 : 0

  name = "stop-testing"
  role = aws_iam_role.session_backstop[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StopTheDatabase"
        Effect   = "Allow"
        Action   = "rds:StopDBInstance"
        Resource = aws_db_instance.main.arn
      },
      {
        Sid       = "ScaleInTheServices"
        Effect    = "Allow"
        Action    = "ecs:UpdateService"
        Resource  = "arn:aws:ecs:${var.region}:${var.account_id}:service/${aws_ecs_cluster.main.name}/*"
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
    ]
  })
}

resource "aws_scheduler_schedule" "stop_database" {
  count = local.backstop_enabled ? 1 : 0

  name                         = "${local.prefix}-backstop-database"
  description                  = "Testing backstop: stop the nonprod database (aws-session.yml down is the normal path)"
  schedule_expression          = var.session_backstop_schedule
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance"
    role_arn = aws_iam_role.session_backstop[0].arn
    input    = jsonencode({ DbInstanceIdentifier = aws_db_instance.main.identifier })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}

resource "aws_scheduler_schedule" "scale_in" {
  for_each = local.backstop_services

  name                         = "${local.prefix}-backstop-${each.key}"
  description                  = "Testing backstop: desired count 0 for ${each.key} (aws-session.yml down is the normal path)"
  schedule_expression          = var.session_backstop_schedule
  schedule_expression_timezone = "UTC"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:updateService"
    role_arn = aws_iam_role.session_backstop[0].arn
    input    = jsonencode({ Cluster = aws_ecs_cluster.main.name, Service = each.key, DesiredCount = 0 })

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
