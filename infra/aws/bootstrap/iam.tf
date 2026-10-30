# Roles for GitHub Actions. No IAM user and no access key exists or is created (owner decision).
# Every trust is GitHub OIDC with the immutable repository subject, a protected environment and,
# for Terraform, the main branch.
#
# One CI role and one deployer per environment (review finding R-17): a job in a nonprod GitHub
# environment can only reach the nonprod deployer, which can only read and write nonprod state and
# is refused anything tagged, or named, for prod; and the other way round.

# --- The workload boundary -----------------------------------------------------------------------
#
# Every role stack/ creates (task execution, task, scheduler, db-admin) must carry this boundary;
# the deployer cannot create a role without it. Whatever a role's own policy says, it can never
# exceed what is listed here, and never acts outside eu-central-1.

resource "aws_iam_policy" "workload_boundary" {
  name = "${local.prefix}-workload-boundary"
  path = "/munaxa-shared/"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrPull"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "*"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/munaxa/*"
      },
      {
        Sid    = "OwnSecrets"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-nonprod/*",
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-prod/*",
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:rds!*",
        ]
      },
      {
        Sid      = "KmsUse"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:Sign"]
        Resource = "arn:aws:kms:${var.region}:${var.account_id}:key/*"
      },
      {
        # The stack's own file buckets (stack/storage.tf), never Docs Production's munaxa-docs-*.
        Sid    = "OwnFileBuckets"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::munaxa-nonprod-*", "arn:aws:s3:::munaxa-nonprod-*/*",
          "arn:aws:s3:::munaxa-prod-*", "arn:aws:s3:::munaxa-prod-*/*",
        ]
      },
      {
        Sid      = "ScheduledTasks"
        Effect   = "Allow"
        Action   = ["ecs:RunTask", "iam:PassRole"]
        Resource = "*"
      },
      {
        Sid       = "ThisRegionOnly"
        Effect    = "Deny"
        NotAction = ["iam:PassRole"]
        Resource  = "*"
        Condition = { StringNotEquals = { "aws:RequestedRegion" = var.region } }
      },
      {
        Sid      = "NeverMunaxaDocsProduction"
        Effect   = "Deny"
        Action   = "*"
        Resource = ["arn:aws:secretsmanager:*:*:secret:munaxa-docs*", "arn:aws:s3:::munaxa-docs*"]
      },
      # Docs in the shared stack (stack/docs.tf) runs the images the Docs bootstrap publishes to
      # munaxa-docs/*: pulling them is allowed above, anything else on those repositories is not.
      {
        Sid       = "MunaxaDocsImagesPullOnly"
        Effect    = "Deny"
        NotAction = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource  = "arn:aws:ecr:*:*:repository/munaxa-docs/*"
      },
    ]
  })
}

# --- The deployer --------------------------------------------------------------------------------

locals {
  # The other environment of each deployer, whose resources it must never touch.
  other_environment = { nonprod = "prod", prod = "nonprod" }
}

data "aws_iam_policy_document" "deployer_trust" {
  for_each = var.deploy_environments

  statement {
    sid     = "CiRoleWithSourceIdentity"
    actions = ["sts:AssumeRole", "sts:SetSourceIdentity"]
    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.ci[each.key].arn]
    }
    condition {
      test     = "StringEquals"
      variable = "sts:SourceIdentity"
      values   = ["github-actions"]
    }
  }
}

resource "aws_iam_role" "deployer" {
  for_each = var.deploy_environments

  name                 = "${local.prefix}-deployer-${each.key}"
  path                 = "/munaxa-shared/bootstrap/"
  assume_role_policy   = data.aws_iam_policy_document.deployer_trust[each.key].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deployer" {
  for_each = var.deploy_environments

  statement {
    sid = "StackServices"
    actions = [
      "ec2:*", "elasticloadbalancing:*", "ecs:*", "rds:*", "logs:*", "acm:*",
      "servicediscovery:*", "route53:CreateHostedZone", "route53:DeleteHostedZone", "route53:GetHostedZone",
      "route53:ListHostedZonesByName", "route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets",
      "route53:GetChange", "route53:ChangeTagsForResource", "route53:ListTagsForResource",
      "scheduler:*", "cloudwatch:*",
      "secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:DescribeSecret",
      "secretsmanager:TagResource", "secretsmanager:UntagResource", "secretsmanager:UpdateSecret",
      "secretsmanager:GetResourcePolicy", "secretsmanager:ListSecrets",
      "kms:CreateKey", "kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias", "kms:DescribeKey",
      "kms:GetKeyPolicy", "kms:PutKeyPolicy", "kms:GetKeyRotationStatus", "kms:EnableKeyRotation",
      "kms:ListAliases", "kms:ListResourceTags", "kms:TagResource", "kms:UntagResource",
      "kms:ScheduleKeyDeletion", "kms:GetPublicKey", "kms:CreateGrant",
      "ecr:DescribeRepositories", "ecr:DescribeImages",
    ]
    resources = ["*"]
  }

  statement {
    sid = "RolesUnderSharedPathWithBoundary"
    actions = [
      "iam:CreateRole", "iam:PutRolePermissionsBoundary",
    ]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.workload_boundary.arn]
    }
  }

  statement {
    sid = "ManageSharedRoles"
    actions = [
      "iam:GetRole", "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:PassRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/*"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${var.account_id}:role/aws-service-role/*"]
  }

  # The stack's file buckets (stack/storage.tf): bucket configuration only, no object access.
  statement {
    sid = "FileBuckets"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket", "s3:GetBucket*", "s3:PutBucket*",
      "s3:DeleteBucketPolicy", "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
      "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration", "s3:GetAccelerateConfiguration",
      "s3:GetReplicationConfiguration", "s3:GetAnalyticsConfiguration", "s3:GetInventoryConfiguration",
      "s3:GetMetricsConfiguration", "s3:GetIntelligentTieringConfiguration",
    ]
    resources = ["arn:aws:s3:::munaxa-nonprod-*", "arn:aws:s3:::munaxa-prod-*"]
  }

  # Its own environment's state and saved plans only (envs/<env>.backend.hcl, <env>/plans/).
  # Listing stays bucket-wide: the S3 backend lists workspaces at init, and key names hold no secret.
  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "State"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/${each.key}/*"]
  }

  # RDS creates the master-password secret and encrypts storage with the environment data key on the
  # deployer's behalf; the deployer never decrypts anything directly.
  statement {
    sid       = "DataKeyThroughRdsAndSecretsManager"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext"]
    resources = ["arn:aws:kms:${var.region}:${var.account_id}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["rds.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "StateKey"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.state.arn]
  }

  # Guardrails: these win over every allow above.
  statement {
    sid         = "ThisRegionOnly"
    effect      = "Deny"
    not_actions = ["iam:*", "sts:*", "route53:*", "s3:*"]
    resources   = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  statement {
    sid     = "NeverMunaxaDocsOrBootstrap"
    effect  = "Deny"
    actions = ["*"]
    resources = [
      "arn:aws:iam::${var.account_id}:role/munaxa-docs/*",
      "arn:aws:iam::${var.account_id}:role/munaxa-shared/bootstrap/*",
      "arn:aws:iam::${var.account_id}:policy/munaxa-shared/*",
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-docs*",
      "arn:aws:rds:${var.region}:${var.account_id}:db:munaxa-docs*",
      "arn:aws:ecs:${var.region}:${var.account_id}:cluster/munaxa-docs*",
      "arn:aws:s3:::munaxa-docs*",
    ]
  }

  # Review finding P9: Docs Production's VPC, subnets, security groups, load balancer, listeners,
  # target groups, database, cluster, keys and logs carry Project = MunaxaDocs (the Docs Terraform's
  # default_tags), and their ARNs have generated ids that no name pattern above can match. ec2:*
  # and elasticloadbalancing:* on "*" would otherwise reach them. The shared stack tags its own
  # resources Project = munaxa and never reads a Docs resource. The deployer may also not create a
  # resource with that tag, or put it on one.
  statement {
    sid       = "NeverMunaxaDocsProductionByTag"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["MunaxaDocs"]
    }
  }

  statement {
    sid       = "NeverTagAsMunaxaDocs"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = ["MunaxaDocs"]
    }
  }

  # R-17: never the other environment, by its tag (stack/ tags Environment = nonprod | prod) or by
  # the names stack/ gives it (munaxa-<env>-*, munaxa-<env>/*, /munaxa/<env>/).
  statement {
    sid       = "NeverTheOtherEnvironmentByTag"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [local.other_environment[each.key]]
    }
  }

  statement {
    sid       = "NeverCreateForTheOtherEnvironment"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [local.other_environment[each.key]]
    }
  }

  statement {
    sid     = "NeverTheOtherEnvironmentByName"
    effect  = "Deny"
    actions = ["*"]
    resources = [
      "arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${local.other_environment[each.key]}-*",
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-${local.other_environment[each.key]}/*",
      "arn:aws:s3:::munaxa-${local.other_environment[each.key]}-*",
      "arn:aws:rds:${var.region}:${var.account_id}:db:munaxa-${local.other_environment[each.key]}-*",
      "arn:aws:ecs:${var.region}:${var.account_id}:cluster/munaxa-${local.other_environment[each.key]}*",
      "arn:aws:logs:${var.region}:${var.account_id}:log-group:/munaxa/${local.other_environment[each.key]}/*",
      "${aws_s3_bucket.state.arn}/${local.other_environment[each.key]}/*",
    ]
  }

  statement {
    sid    = "NoSecretValuesNoUsersNoKeys"
    effect = "Deny"
    actions = [
      "secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:BatchGetSecretValue",
      "iam:CreateUser", "iam:CreateAccessKey", "iam:CreateLoginProfile",
      "kms:Sign",
      "organizations:*", "account:*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deployer" {
  for_each = var.deploy_environments

  name   = "deployer"
  role   = aws_iam_role.deployer[each.key].id
  policy = data.aws_iam_policy_document.deployer[each.key].json
}

# --- The CI roles: munaxa-platform, main, a protected environment of that environment --------------

data "aws_iam_policy_document" "ci_trust" {
  for_each = var.deploy_environments

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

resource "aws_iam_role" "ci" {
  for_each = var.deploy_environments

  name                 = "${local.prefix}-ci-${each.key}"
  path                 = "/munaxa-shared/bootstrap/"
  assume_role_policy   = data.aws_iam_policy_document.ci_trust[each.key].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "ci" {
  for_each = var.deploy_environments

  name = "assume-own-deployer-only"
  role = aws_iam_role.ci[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sts:AssumeRole", "sts:SetSourceIdentity"]
      Resource = aws_iam_role.deployer[each.key].arn
    }]
  })
}

# --- Image publishers: one per product repository ------------------------------------------------

data "aws_iam_policy_document" "publisher_trust" {
  for_each = var.image_repositories

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
    # The protected image-release environment of this one repository, on an image/<sha> tag.
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values   = ["${local.subject[each.key]}:environment:image-release"]
    }
    condition {
      test     = "StringLike"
      variable = "${local.oidc}:ref"
      values   = ["refs/tags/image/*"]
    }
  }
}

resource "aws_iam_role" "publisher" {
  for_each = var.image_repositories

  name                 = "${each.key}-image-publisher"
  path                 = "/munaxa-shared/bootstrap/"
  assume_role_policy   = data.aws_iam_policy_document.publisher_trust[each.key].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "publisher" {
  for_each = var.image_repositories

  name = "push-own-images"
  role = aws_iam_role.publisher[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings", "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [for image in each.value : aws_ecr_repository.image["${each.key}/${image}"].arn]
      },
    ]
  })
}
