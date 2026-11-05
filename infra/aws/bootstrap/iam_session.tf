# Finding H-3 (phase 5): Testing sessions (aws-session.yml) run in aws-nonprod-session, a GitHub
# environment with no required reviewer (so the 20:00 UTC backstop runs unattended). They get
# their own CI role and deployer, which can do only what a session does: plan the whole stack
# (reads), write nonprod state, create and delete the ALB, its listeners, rules and target groups,
# the ECS services and their Cloud Map entries, and start and stop the nonprod database. No
# security-group rule: those are all persistent (R10, phase 6). No IAM, KMS, Secrets Manager, S3 configuration, logs, network or
# database change: those stay with the reviewed aws-terraform.yml path (aws-nonprod).
#
# aws-session.yml needs no change: it reads vars.AWS_CI_ROLE_ARN and vars.AWS_DEPLOYER_ROLE_ARN in
# a job that names environment aws-nonprod-session, and environment variables take precedence
# over repository variables. The owner sets both on that environment from the
# session_ci_role_arns and session_deployer_role_arns outputs (README G2 step 4).

data "aws_iam_policy_document" "ci_session_trust" {
  for_each = var.session_environments

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values   = [for e in each.value : "${local.subject["munaxa-platform"]}:environment:${e}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:ref"
      values   = ["refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "ci_session" {
  for_each = var.session_environments

  name                 = "${local.prefix}-ci-${each.key}-session"
  path                 = "/munaxa-shared/bootstrap/"
  assume_role_policy   = data.aws_iam_policy_document.ci_session_trust[each.key].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "ci_session" {
  for_each = var.session_environments

  name = "assume-own-session-deployer-only"
  role = aws_iam_role.ci_session[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sts:AssumeRole", "sts:SetSourceIdentity"]
      Resource = aws_iam_role.deployer_session[each.key].arn
    }]
  })
}

data "aws_iam_policy_document" "deployer_session_trust" {
  for_each = var.session_environments

  statement {
    sid     = "SessionCiRoleWithSourceIdentity"
    actions = ["sts:AssumeRole", "sts:SetSourceIdentity"]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ci_session[each.key].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:SourceIdentity"
      values   = ["github-actions"]
    }
  }
}

resource "aws_iam_role" "deployer_session" {
  for_each = var.session_environments

  name                 = "${local.prefix}-deployer-${each.key}-session"
  path                 = "/munaxa-shared/bootstrap/"
  assume_role_policy   = data.aws_iam_policy_document.deployer_session_trust[each.key].json
  max_session_duration = 3600
}

# The session's writes, on top of the environment deployer's state access and guardrails
# (source_policy_documents), so every deny of iam.tf applies to the session deployer too.
data "aws_iam_policy_document" "deployer_session" {
  for_each = var.session_environments

  source_policy_documents = [data.aws_iam_policy_document.deployer[each.key].json]

  # The ALB, listeners, listener rules and target groups (stack/edge.tf, modules/service).
  statement {
    sid     = "SessionEdgeAndServices"
    actions = ["elasticloadbalancing:*", "ecs:CreateService", "ecs:UpdateService", "ecs:DeleteService", "ecs:TagResource", "ecs:UntagResource"]
    resources = [
      "${local.arn.elb}:loadbalancer/app/munaxa-${each.key}/*",
      "${local.arn.elb}:listener/app/munaxa-${each.key}/*",
      "${local.arn.elb}:listener-rule/app/munaxa-${each.key}/*",
      "${local.arn.elb}:targetgroup/munaxa-${each.key}-*",
      "${local.arn.ecs}:service/munaxa-${each.key}/*",
    ]
  }

  # Review R10 (closed in phase 6): a session writes no security-group rule at all. The task
  # groups' ingress from the ALB (modules/service from_alb) is persistent, like the ALB's own rules
  # and its egress: it names the persistent ALB group, so it admits nothing while the ALB is down.
  # IAM has no condition key for a rule's CIDR or source group (AuthorizeSecurityGroupIngress has
  # ec2:Region only), so the only way to keep a session from opening a task (public IPv4) to the
  # internet is to give it no rule action, and to deny them all explicitly.
  statement {
    sid    = "SessionNeverSecurityGroupRules"
    effect = "Deny"
    actions = [
      "ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress",
      "ec2:ModifySecurityGroupRules", "ec2:UpdateSecurityGroupRuleDescriptionsIngress",
      "ec2:UpdateSecurityGroupRuleDescriptionsEgress",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "SessionNeverGroupTags"
    effect    = "Deny"
    actions   = ["ec2:CreateTags", "ec2:DeleteTags"]
    resources = ["${local.arn.ec2}:security-group/*", "${local.arn.ec2}:security-group-rule/*"]
  }

  statement {
    sid       = "SessionCloudMapServices"
    actions   = ["servicediscovery:CreateService", "servicediscovery:DeleteService", "servicediscovery:UpdateService"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [each.key]
    }
  }

  # Cloud Map entries: the new service with the tags (its namespace by SessionCloudMapServices).
  # CreateService is authorized on the namespace and on the new service, so the request tags may
  # admit only the service: an untagged namespace of another workload never matches (phase 5
  # review 06 §8.5, R11), as CloudMapServiceWithOwnTags does for the full deployer.
  statement {
    sid       = "SessionDiscoveryWithOwnTags"
    actions   = ["servicediscovery:CreateService"]
    resources = ["arn:aws:servicediscovery:${var.region}:${var.account_id}:service/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [each.key]
    }
  }

  # Tagging on create (servicediscovery:TagResource has no resource type; residual R3).
  statement {
    sid       = "SessionDiscoveryTagOnCreate"
    actions   = ["servicediscovery:TagResource"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [each.key]
    }
  }

  # ECS services pass no role of their own; the task roles are named in the task definitions.
  statement {
    sid       = "SessionPassOwnRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com"]
    }
  }

  # The database between sessions (aws-session.yml start and stop steps).
  statement {
    sid       = "SessionDatabaseStartStop"
    actions   = ["rds:StartDBInstance", "rds:StopDBInstance"]
    resources = ["${local.arn.rds}:db:munaxa-${each.key}-pg"]
  }
}

resource "aws_iam_role_policy" "deployer_session" {
  for_each = var.session_environments

  name   = "session-deployer"
  role   = aws_iam_role.deployer_session[each.key].id
  policy = data.aws_iam_policy_document.deployer_session[each.key].json
}

resource "aws_iam_role_policy_attachment" "deployer_session_read" {
  for_each = var.session_environments

  role       = aws_iam_role.deployer_session[each.key].name
  policy_arn = aws_iam_policy.deployer_read.arn
}

# Review B-2: what a session plan refreshes beyond deployer_read. The session state holds the whole
# stack (64 resources at G3), so its plan reads the persistent layer too: the environment's keys,
# secret containers, file bucket and task roles. Reads only, each on this environment's resources.
# No iam:GetPolicy: no stack resource reads a managed policy (GetRole returns the boundary ARN),
# and every policy under munaxa-shared/ stays denied (NeverMunaxaDocsOrBootstrap). A managed policy, so the session role's inline policy stays under its size limit.
data "aws_iam_policy_document" "deployer_session_read" {
  for_each = var.session_environments

  statement {
    sid       = "RefreshOwnKeys"
    actions   = ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags"]
    resources = ["${local.arn.kms}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [each.key]
    }
  }

  statement {
    sid       = "RefreshOwnSecretContainers"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy"]
    resources = ["${local.arn.sm}:secret:munaxa-${each.key}/*"]
  }

  statement {
    sid = "RefreshOwnBuckets"
    actions = [
      "s3:ListBucket", "s3:GetBucket*", "s3:GetAccelerateConfiguration", "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration", "s3:GetEncryptionConfiguration",
    ]
    resources = ["arn:aws:s3:::munaxa-${each.key}-*"]
  }

  statement {
    sid       = "RefreshOwnRoles"
    actions   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListRoleTags"]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"]
  }
}

resource "aws_iam_policy" "deployer_session_read" {
  for_each = var.session_environments

  name        = "${local.prefix}-deployer-${each.key}-session-read"
  path        = "/munaxa-shared/bootstrap/"
  description = "What a Testing session plan refreshes beyond the shared reads, on ${each.key} resources only"
  policy      = data.aws_iam_policy_document.deployer_session_read[each.key].json
}

resource "aws_iam_role_policy_attachment" "deployer_session_refresh" {
  for_each = var.session_environments

  role       = aws_iam_role.deployer_session[each.key].name
  policy_arn = aws_iam_policy.deployer_session_read[each.key].arn
}
