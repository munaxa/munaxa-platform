# Testing's independent session cleanup (stack/session-cleanup.tf, Stage E blocker BE-2): what the
# nonprod deployer needs to create and keep the cleanup state machine and its alarm topic. A separate
# managed policy, so the existing allow-lists keep their size, and only for nonprod. Off until
# testing_session_cleanup is true (the Stage B-2 root apply, before the stack apply that enables it).
# The session deployer only refreshes them (iam_session.tf RefreshSessionCleanup); it never writes.

locals {
  session_cleanup_deployer = var.testing_session_cleanup && contains(keys(var.deploy_environments), "nonprod")
}

data "aws_iam_policy_document" "deployer_session_cleanup" {
  count = local.session_cleanup_deployer ? 1 : 0

  # Guardrails first: the deployer's own denies (iam.tf) apply through the role's inline policy;
  # this document only allows.
  statement {
    sid = "OwnSessionCleanupStateMachine"
    actions = [
      "states:CreateStateMachine", "states:UpdateStateMachine", "states:DeleteStateMachine",
      "states:DescribeStateMachine", "states:ListStateMachineVersions", "states:TagResource",
      "states:UntagResource", "states:ListTagsForResource",
    ]
    resources = ["arn:aws:states:${var.region}:${var.account_id}:stateMachine:munaxa-nonprod-*"]
  }

  # Definition validation takes no resource.
  statement {
    sid       = "ValidateDefinitions"
    actions   = ["states:ValidateStateMachineDefinition"]
    resources = ["*"]
  }

  statement {
    sid = "OwnAlarmTopics"
    actions = [
      "sns:CreateTopic", "sns:DeleteTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes",
      "sns:TagResource", "sns:UntagResource", "sns:ListTagsForResource",
    ]
    resources = ["arn:aws:sns:${var.region}:${var.account_id}:munaxa-nonprod-*"]
  }

  # Only the cleanup role, and only to Step Functions.
  statement {
    sid       = "PassTheCleanupRole"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-nonprod-session-cleanup"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "deployer_session_cleanup" {
  count = local.session_cleanup_deployer ? 1 : 0

  name        = "${local.prefix}-deployer-nonprod-session-cleanup"
  path        = "/munaxa-shared/bootstrap/"
  description = "Testing session cleanup: the nonprod state machine, its alarm topic and its role (nonprod names only)"
  policy      = data.aws_iam_policy_document.deployer_session_cleanup[0].json
}

resource "aws_iam_role_policy_attachment" "deployer_session_cleanup" {
  count = local.session_cleanup_deployer ? 1 : 0

  role       = aws_iam_role.deployer["nonprod"].name
  policy_arn = aws_iam_policy.deployer_session_cleanup[0].arn
}
