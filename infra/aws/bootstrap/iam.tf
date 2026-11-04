# Roles for GitHub Actions. No IAM user and no access key exists or is created (owner decision).
# Every trust is GitHub OIDC with the immutable repository subject, a protected environment and,
# for Terraform, the main branch.
#
# One CI role and one deployer per environment (review finding R-17): a job in a nonprod GitHub
# environment can only reach the nonprod deployer, which can only read and write nonprod state and
# is refused anything tagged, or named, for prod; and the other way round. Testing sessions have
# their own, narrower CI role and deployer (iam_session.tf, finding H-3).
#
# B2 / TD-14 (phase 5): the deployers' permissions are a positive allow-list (iam_allow.tf):
# writes only on resources named for the deployer's environment, or tagged Project = munaxa AND
# Environment = <env>, or created with those tags. The denies below stay as a second layer.

locals {
  # The other environment of each deployer, whose resources it must never touch.
  other_environment = { nonprod = "prod", prod = "nonprod" }

  # The workload boundary of each environment. nonprod keeps the name stack/ already uses, so
  # Testing needs no stack change; prod gets its own name, which stack/ must use before any prod
  # apply (until then a prod role cannot be created at all: fail closed).
  boundary_name = { nonprod = "${local.prefix}-workload-boundary", prod = "${local.prefix}-workload-boundary-prod" }
  boundary_arn  = { for env, name in local.boundary_name : env => "arn:aws:iam::${var.account_id}:policy/munaxa-shared/${name}" }
}

# --- The workload boundaries, one per environment (finding H-1) -----------------------------------
#
# Every role stack/ creates (task execution, task, scheduler, db-admin) must carry its
# environment's boundary; the deployer cannot create a role without it, nor a role whose name is
# not its environment's. Whatever a role's own policy says, it can never exceed what is listed
# here: its own environment's secrets, keys, buckets, logs and tasks, and never outside
# eu-central-1. A nonprod role can therefore never read a prod secret, key or bucket.

moved {
  from = aws_iam_policy.workload_boundary
  to   = aws_iam_policy.workload_boundary["nonprod"]
}

resource "aws_iam_policy" "workload_boundary" {
  for_each = var.deploy_environments

  name = local.boundary_name[each.key]
  path = "/munaxa-shared/"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrSignIn"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid      = "EcrPull"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-*"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/munaxa/${each.key}/*"
      },
      {
        Sid      = "OwnSecrets"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-${each.key}/*"
      },
      {
        # The RDS-managed master secret (rds!db-<id>): only the one of this environment's instance,
        # by the tag RDS puts on it.
        Sid       = "OwnRdsMasterSecret"
        Effect    = "Allow"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:rds!*"
        Condition = { StringLike = { "aws:ResourceTag/aws:rds:primaryDBInstanceArn" = "arn:aws:rds:${var.region}:${var.account_id}:db:munaxa-${each.key}-*" } }
      },
      {
        Sid       = "OwnKeys"
        Effect    = "Allow"
        Action    = ["kms:Decrypt", "kms:Sign"]
        Resource  = "arn:aws:kms:${var.region}:${var.account_id}:key/*"
        Condition = { StringEquals = { "aws:ResourceTag/Project" = "munaxa", "aws:ResourceTag/Environment" = each.key } }
      },
      {
        # The stack's own file buckets (stack/storage.tf), never Docs Production's munaxa-docs-*.
        Sid      = "OwnFileBuckets"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListBucket"]
        Resource = ["arn:aws:s3:::munaxa-${each.key}-*", "arn:aws:s3:::munaxa-${each.key}-*/*"]
      },
      {
        Sid      = "ScheduledTasks"
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = "arn:aws:ecs:${var.region}:${var.account_id}:task-definition/munaxa-${each.key}-*:*"
      },
      {
        Sid      = "PassOwnRoles"
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"
      },
      {
        Sid       = "ThisRegionOnly"
        Effect    = "Deny"
        NotAction = ["iam:PassRole"]
        Resource  = "*"
        Condition = { StringNotEquals = { "aws:RequestedRegion" = var.region } }
      },
      {
        Sid       = "NeverTheOtherEnvironment"
        Effect    = "Deny"
        Action    = "*"
        Resource  = "*"
        Condition = { StringEquals = { "aws:ResourceTag/Environment" = local.other_environment[each.key] } }
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

# The deployer's inline policy: its own state, and the guardrails, which win over every allow in
# iam_allow.tf and iam_session.tf (the session deployer carries the same guardrails).
data "aws_iam_policy_document" "deployer" {
  for_each = var.deploy_environments

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

  statement {
    sid       = "StateKey"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.state.arn]
  }

  # Guardrails: these win over every allow.
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

  # Old Docs Production (retired 4 Nov 2026) and the Docs bootstrap it leaves: roles, policies,
  # the shared GitHub OIDC provider, secrets, databases and their snapshots (the kept final
  # snapshot munaxa-docs-eu-prod-pg-final), clusters, buckets (state, CloudTrail), key aliases,
  # the account trail, and the Docs log groups. Also the shared bootstrap's own roles and policies.
  statement {
    sid     = "NeverMunaxaDocsOrBootstrap"
    effect  = "Deny"
    actions = ["*"]
    resources = [
      "arn:aws:iam::${var.account_id}:role/munaxa-docs/*",
      "arn:aws:iam::${var.account_id}:policy/munaxa-docs/*",
      "arn:aws:iam::${var.account_id}:oidc-provider/*",
      "arn:aws:iam::${var.account_id}:role/munaxa-shared/bootstrap/*",
      "arn:aws:iam::${var.account_id}:policy/munaxa-shared/*",
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-docs*",
      "arn:aws:rds:${var.region}:${var.account_id}:db:munaxa-docs*",
      "arn:aws:rds:${var.region}:${var.account_id}:snapshot:munaxa-docs*",
      "arn:aws:ecs:${var.region}:${var.account_id}:cluster/munaxa-docs*",
      "arn:aws:kms:${var.region}:${var.account_id}:alias/munaxa-docs*",
      "arn:aws:logs:${var.region}:${var.account_id}:log-group:*munaxa-docs*",
      "arn:aws:cloudtrail:*:${var.account_id}:trail/munaxa-docs*",
      "arn:aws:s3:::munaxa-docs*",
    ]
  }

  # Finding H-2: the shared state key and bucket. Every deployer only encrypts and decrypts state
  # objects with the key and reads and writes state objects in the bucket; nothing else, whatever
  # an allow says (the key carries Project = munaxa and no Environment, so no tag deny covers it).
  statement {
    sid    = "ProtectStateKeyAndBucket"
    effect = "Deny"
    not_actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey",
      "s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject",
    ]
    resources = [aws_kms_key.state.arn, aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  # Finding H-2b: the stack backends name the state key by its alias (kms_key_id =
  # alias/munaxa-shared-tfstate), so no deployer may create, repoint or delete a shared alias, nor
  # put any alias on the state key. An alias call is authorized on both the alias and the key.
  statement {
    sid       = "NeverSharedAliases"
    effect    = "Deny"
    actions   = ["kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"]
    resources = ["arn:aws:kms:${var.region}:${var.account_id}:alias/${local.prefix}-*", aws_kms_key.state.arn]
  }

  # Review finding P9: Docs Production's resources carry Project = MunaxaDocs (the Docs Terraform's
  # default_tags), and their ARNs have generated ids that no name pattern above can match. The
  # shared stack tags its own resources Project = munaxa and never reads a Docs resource. The
  # deployer may also not create a resource with that tag, or put it on one.
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

  # Review finding N-2: whatever carries a Project tag that is not the shared stack's own
  # ("munaxa", stack/ and bootstrap/ default_tags) is refused, and the deployer may not create or
  # tag a resource for another project. A negated operator is true when its key is missing, so
  # each statement also requires the key to be present (Null = false): without it, every untagged
  # request, Describe* included, was denied (G2 verification, 31 Oct). Untagged resources are kept
  # out by the allow-list instead (B2 / TD-14, iam_allow.tf).
  statement {
    sid       = "NeverAnotherProjectByTag"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:ResourceTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "Null"
      variable = "aws:ResourceTag/Project"
      values   = ["false"]
    }
  }

  statement {
    sid       = "NeverTagForAnotherProject"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestTag/Project"
      values   = ["munaxa"]
    }
    condition {
      test     = "Null"
      variable = "aws:RequestTag/Project"
      values   = ["false"]
    }
  }

  # M-1: every create that takes tags must carry Project = munaxa and Environment = <env>
  # (StringNotEquals is true when the key is missing, which is the point here). The creates that
  # take no tags, or whose tags AWS sets (the RDS-managed secret), are not listed.
  statement {
    sid       = "CreatesCarryProjectTag"
    effect    = "Deny"
    actions   = local.tagged_creates
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestTag/Project"
      values   = ["munaxa"]
    }
  }

  statement {
    sid       = "CreatesCarryEnvironmentTag"
    effect    = "Deny"
    actions   = local.tagged_creates
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestTag/Environment"
      values   = [each.key]
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
      local.boundary_arn[local.other_environment[each.key]],
      "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:munaxa-${local.other_environment[each.key]}/*",
      "arn:aws:s3:::munaxa-${local.other_environment[each.key]}-*",
      "arn:aws:rds:${var.region}:${var.account_id}:db:munaxa-${local.other_environment[each.key]}-*",
      "arn:aws:ecs:${var.region}:${var.account_id}:cluster/munaxa-${local.other_environment[each.key]}*",
      "arn:aws:logs:${var.region}:${var.account_id}:log-group:/munaxa/${local.other_environment[each.key]}/*",
      "${aws_s3_bucket.state.arn}/${local.other_environment[each.key]}/*",
    ]
  }

  # The account's default VPC (and any other listed VPC): nothing in it is ever changed, which
  # also keeps its default security group out of the default-group adoption in iam_allow.tf.
  statement {
    sid         = "NeverProtectedVpcs"
    effect      = "Deny"
    not_actions = ["ec2:Describe*"]
    resources   = [for id in var.protected_vpc_ids : "arn:aws:ec2:${var.region}:${var.account_id}:vpc/${id}"]
  }

  statement {
    sid         = "NeverInProtectedVpcs"
    effect      = "Deny"
    not_actions = ["ec2:Describe*"]
    resources   = ["*"]
    condition {
      test     = "ArnEquals"
      variable = "ec2:Vpc"
      values   = [for id in var.protected_vpc_ids : "arn:aws:ec2:${var.region}:${var.account_id}:vpc/${id}"]
    }
  }

  statement {
    sid       = "NeverProtectedVpcsInZones"
    effect    = "Deny"
    actions   = ["route53:CreateHostedZone", "route53:AssociateVPCWithHostedZone", "route53:DisassociateVPCFromHostedZone"]
    resources = ["*"]
    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "route53:VPCs"
      values   = var.protected_vpc_ids
    }
  }

  # M-1: account-wide settings, sharing outside the account, and the identity and audit services
  # are never the deployer's, whatever an allow says.
  statement {
    sid    = "NeverAccountSettingsOrSharing"
    effect = "Deny"
    actions = [
      "ec2:*ByDefault", "ec2:*EbsDefaultKmsKeyId", "ec2:ModifyInstanceMetadataDefaults",
      "ec2:*BlockPublicAccess*", "ec2:*SerialConsole*", "ec2:*VpcPeering*", "ec2:*TransitGateway*",
      "ec2:*Vpn*", "ec2:*Ipam*", "ec2:ModifySnapshotAttribute", "ec2:ModifyImageAttribute",
      "rds:ModifyCertificates", "rds:ModifyDBSnapshotAttribute", "rds:ModifyDBClusterSnapshotAttribute",
      "ecs:PutAccountSetting*", "ecs:DeleteAccountSetting", "logs:PutAccountPolicy", "logs:DeleteAccountPolicy",
      "secretsmanager:PutResourcePolicy", "s3:PutAccountPublicAccessBlock",
      "kms:CancelKeyDeletion", "iam:DeleteRolePermissionsBoundary",
      "cloudtrail:*", "config:*", "guardduty:*", "securityhub:*", "access-analyzer:*", "budgets:*", "ce:*",
    ]
    resources = ["*"]
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
