# Testing's RDS restart stop (stack/rds-restart-stop.tf, report 2026-11-21-autonomous-security-and-
# testing-readiness file 06 section 3): what the nonprod deployer needs to create and keep it, beyond
# what it already has. A separate managed policy, like iam_session_cleanup.tf, and only for nonprod.
# OFF by default (testing_rds_restart_stop): merging this changes no bootstrap plan.
#
# The stack's 8 resources, and what already covers each for the nonprod deployer:
#   aws_iam_role x2, aws_iam_role_policy x2  iam_allow.tf OwnRolesWithOwnBoundary, ManageOwnRoles
#                                            (role/munaxa-shared/munaxa-nonprod-*, nonprod boundary)
#   aws_sfn_state_machine                    iam_session_cleanup.tf OwnSessionCleanupStateMachine
#                                            (stateMachine:munaxa-nonprod-*), ValidateDefinitions;
#                                            iam:PassRole of its role to states: HERE
#   aws_cloudwatch_event_rule, _event_target events:* on the rule, iam:PassRole of the EventBridge
#                                            role to events: HERE (nothing granted events before)
#   aws_cloudwatch_metric_alarm              iam_allow.tf OwnNames cloudwatch:* on alarm:munaxa-nonprod-*
# The workload boundary additions are in iam.tf (TestingRdsRestartStop*), the session deployer's
# refresh reads in iam_session.tf (RefreshRdsRestartStop).

locals {
  rds_restart_stop_bootstrap = var.testing_rds_restart_stop && var.testing_session_cleanup
  rds_restart_stop_deployer  = local.rds_restart_stop_bootstrap && contains(keys(var.deploy_environments), "nonprod")

  rds_restart_stop_rule_arn = "arn:aws:events:${var.region}:${var.account_id}:rule/munaxa-nonprod-rds-restart-stop"
  rds_restart_stop_role_arns = {
    states = "arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-nonprod-rds-restart-stop"
    events = "arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-nonprod-rds-restart-stop-events"
  }
}

data "aws_iam_policy_document" "deployer_rds_restart_stop" {
  count = local.rds_restart_stop_deployer ? 1 : 0

  # Guardrails first: the deployer's own denies (iam.tf) apply through the role's inline policy;
  # this document only allows.
  #
  # The one rule on the default bus and its one target. PutRule with tags (default_tags) is also
  # authorized as events:TagResource; the target calls take the rule's ARN.
  statement {
    sid = "OwnRestartStopRule"
    actions = [
      "events:PutRule", "events:DeleteRule", "events:DescribeRule",
      "events:PutTargets", "events:RemoveTargets", "events:ListTargetsByRule",
      "events:TagResource", "events:UntagResource", "events:ListTagsForResource",
    ]
    resources = [local.rds_restart_stop_rule_arn]
  }

  # The state machine's role, only to Step Functions.
  statement {
    sid       = "PassTheRestartStopRole"
    actions   = ["iam:PassRole"]
    resources = [local.rds_restart_stop_role_arns.states]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["states.amazonaws.com"]
    }
  }

  # The rule target's role (PutTargets), only to EventBridge.
  statement {
    sid       = "PassTheRestartStopEventsRole"
    actions   = ["iam:PassRole"]
    resources = [local.rds_restart_stop_role_arns.events]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "deployer_rds_restart_stop" {
  count = local.rds_restart_stop_deployer ? 1 : 0

  name        = "${local.prefix}-deployer-nonprod-rds-restart-stop"
  path        = "/munaxa-shared/bootstrap/"
  description = "Testing RDS restart stop: the nonprod EventBridge rule and passing its two roles (nonprod names only)"
  policy      = data.aws_iam_policy_document.deployer_rds_restart_stop[0].json
}

resource "aws_iam_role_policy_attachment" "deployer_rds_restart_stop" {
  count = local.rds_restart_stop_deployer ? 1 : 0

  role       = aws_iam_role.deployer["nonprod"].name
  policy_arn = aws_iam_policy.deployer_rds_restart_stop[0].arn
}
