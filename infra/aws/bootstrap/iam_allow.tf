# B2 / TD-14 (phase 5): the deployers' allow-list. It replaces the earlier "StackServices" grant
# (ec2:*, elasticloadbalancing:*, ecs:*, rds:*, logs:*, acm:*, servicediscovery:* ... on "*"),
# whose only limits were denies on a wrong Project or Environment tag: a resource with no tag at
# all matched no deny, so the deployer could change any untagged resource in the account.
#
# Now a write is allowed only when one of these holds (each a StringEquals ALLOW, not a deny on
# a mismatch):
#
# | Kind              | Services                                   | Condition                              |
# | ----------------- | ------------------------------------------ | -------------------------------------- |
# | By name           | ELB, ECS, RDS, logs, Scheduler, CloudWatch | ARN names munaxa-<env>-* (stack/ names) |
# |                   | alarms, Secrets Manager, KMS aliases, S3,  |                                        |
# |                   | IAM (role/munaxa-shared/munaxa-<env>-*)    |                                        |
# | By existing tags  | EC2, KMS keys, ACM, Cloud Map              | aws:ResourceTag/Project = munaxa AND   |
# |                   |                                            | aws:ResourceTag/Environment = <env>    |
# | Created with tags | EC2 (one statement per created type, so a  | aws:RequestTag/Project = munaxa AND    |
# |                   | parent is never matched by the request     | aws:RequestTag/Environment = <env>;    |
# |                   | tags), KMS, ACM, Cloud Map, ECS task defs  | the parent needs its own tags          |
#
# Reads that Terraform's plan needs (Describe*, List*, metadata Get*) stay on "*": most of them
# have no resource-level permission. They return configuration, never data (no log events, no
# secret values, no database log files, no console output).
#
# What cannot be scoped (documented residual, phase 5 report 02 §5): tagging on create in Cloud
# Map (servicediscovery:TagResource has no resource type), KMS (kms:TagResource on the new key)
# and ACM (acm:AddTagsToCertificate on the new certificate) is allowed by request tag alone, so an
# UNTAGGED key, certificate or Cloud Map namespace could be claimed by tagging it; the adoption of
# a VPC's default security group (aws_default_security_group) likewise; route53:CreateHostedZone
# and DeleteHostedZone (Cloud Map's private zone) have no usable condition.

locals {
  # Creates that take tags, which must carry Project and Environment (guardrails in iam.tf).
  tagged_creates = [
    "ec2:CreateVpc", "ec2:CreateSubnet", "ec2:CreateSecurityGroup", "ec2:CreateRouteTable",
    "ec2:CreateInternetGateway", "ec2:CreateVpcEndpoint",
    "elasticloadbalancing:CreateLoadBalancer", "elasticloadbalancing:CreateTargetGroup",
    "elasticloadbalancing:CreateListener", "elasticloadbalancing:CreateRule",
    "ecs:CreateCluster", "ecs:CreateService", "ecs:RegisterTaskDefinition",
    "rds:CreateDBInstance", "rds:CreateDBSubnetGroup", "rds:CreateDBParameterGroup",
    "logs:CreateLogGroup", "kms:CreateKey", "acm:RequestCertificate",
    "servicediscovery:CreatePrivateDnsNamespace", "servicediscovery:CreateService",
  ]

  # EC2 creates: each action may only create its own resource type with the tags; its parents
  # (VPC, security group, route table) must already carry them (statement OwnTagged).
  ec2_creates = {
    Vpc             = { actions = ["ec2:CreateVpc"], type = "vpc" }
    Subnet          = { actions = ["ec2:CreateSubnet"], type = "subnet" }
    SecurityGroup   = { actions = ["ec2:CreateSecurityGroup"], type = "security-group" }
    RouteTable      = { actions = ["ec2:CreateRouteTable"], type = "route-table" }
    InternetGateway = { actions = ["ec2:CreateInternetGateway"], type = "internet-gateway" }
    VpcEndpoint     = { actions = ["ec2:CreateVpcEndpoint"], type = "vpc-endpoint" }
    Rule            = { actions = ["ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress"], type = "security-group-rule" }
  }
  ec2_create_actions = flatten([for c in values(local.ec2_creates) : c.actions])

  arn = {
    ec2  = "arn:aws:ec2:${var.region}:${var.account_id}"
    elb  = "arn:aws:elasticloadbalancing:${var.region}:${var.account_id}"
    ecs  = "arn:aws:ecs:${var.region}:${var.account_id}"
    rds  = "arn:aws:rds:${var.region}:${var.account_id}"
    logs = "arn:aws:logs:${var.region}:${var.account_id}"
    kms  = "arn:aws:kms:${var.region}:${var.account_id}"
    sm   = "arn:aws:secretsmanager:${var.region}:${var.account_id}"
  }
}

# --- Reads, for every deployer (plan and refresh) ----------------------------------------------

data "aws_iam_policy_document" "deployer_read" {
  statement {
    sid = "ConfigurationReads"
    actions = [
      "ec2:Describe*", "elasticloadbalancing:Describe*", "ecs:Describe*", "ecs:List*",
      "rds:Describe*", "rds:ListTagsForResource", "logs:DescribeLogGroups", "logs:ListTagsForResource",
      "logs:ListTagsLogGroup", "acm:DescribeCertificate", "acm:GetCertificate", "acm:ListCertificates",
      "acm:ListTagsForCertificate", "servicediscovery:Get*", "servicediscovery:List*",
      "route53:GetHostedZone", "route53:ListHostedZones*", "route53:ListResourceRecordSets",
      "route53:GetChange", "route53:ListTagsForResource", "scheduler:GetSchedule", "scheduler:ListSchedules",
      "cloudwatch:DescribeAlarms", "secretsmanager:ListSecrets", "kms:ListAliases", "kms:ListKeys",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ImageMetadata"
    actions   = ["ecr:DescribeRepositories", "ecr:DescribeImages"]
    resources = ["arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-*"]
  }
}

resource "aws_iam_policy" "deployer_read" {
  name        = "${local.prefix}-deployer-read"
  path        = "/munaxa-shared/bootstrap/"
  description = "Configuration reads for the shared deployers (plan and refresh); no data reads"
  policy      = data.aws_iam_policy_document.deployer_read.json
}

resource "aws_iam_role_policy_attachment" "deployer_read" {
  for_each = var.deploy_environments

  role       = aws_iam_role.deployer[each.key].name
  policy_arn = aws_iam_policy.deployer_read.arn
}

# --- Writes, per environment -------------------------------------------------------------------

# Two managed policies per environment (a managed policy holds at most 6,144 characters): what
# is scoped by tags, and what is scoped by name.
data "aws_iam_policy_document" "deployer_allow_tagged" {
  for_each = var.deploy_environments

  # EC2, ACM, Cloud Map and KMS keys have generated ids: changed only when already tagged for this
  # environment. This statement also admits the parents of a create (the VPC of a subnet).
  statement {
    sid = "OwnTagged"
    actions = [
      "ec2:*", "acm:*", "servicediscovery:*",
      "kms:DescribeKey", "kms:GetKeyPolicy", "kms:PutKeyPolicy", "kms:GetKeyRotationStatus",
      "kms:EnableKeyRotation", "kms:ListResourceTags", "kms:TagResource", "kms:UntagResource",
      "kms:ScheduleKeyDeletion", "kms:GetPublicKey", "kms:CreateGrant", "kms:UpdateKeyDescription",
      "kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias", "kms:ListKeyPolicies",
    ]
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

  dynamic "statement" {
    for_each = local.ec2_creates
    content {
      sid       = "Ec2Create${statement.key}"
      actions   = statement.value.actions
      resources = ["${local.arn.ec2}:${statement.value.type}/*"]
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
  }

  # Tags in the create call itself (TagSpecifications), never on an existing resource.
  statement {
    sid       = "Ec2TagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = [for a in local.ec2_create_actions : trimprefix(a, "ec2:")]
    }
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

  # aws_default_security_group (stack/network.tf) tags the new VPC's default group, which AWS
  # creates untagged, then empties it. Only an untagged group, only with this environment's tags
  # and its stack name; never in a protected VPC (iam.tf). Residual: see the header.
  statement {
    sid       = "Ec2AdoptDefaultSecurityGroup"
    actions   = ["ec2:CreateTags"]
    resources = ["${local.arn.ec2}:security-group/*"]
    condition {
      test     = "Null"
      variable = "aws:ResourceTag/Project"
      values   = ["true"]
    }
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
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Name"
      values   = ["munaxa-${each.key}-default-unused"]
    }
  }

  # Created with this environment's tags: KMS keys, certificates, Cloud Map namespaces and
  # services (their tagging on create is a separate permission with no resource of its own).
  statement {
    sid = "CreateWithOwnTags"
    actions = [
      "kms:CreateKey", "kms:TagResource", "acm:RequestCertificate", "acm:AddTagsToCertificate",
      "servicediscovery:CreatePrivateDnsNamespace", "servicediscovery:TagResource",
    ]
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

  # A Cloud Map service: the new service with the tags (its namespace by OwnTagged).
  statement {
    sid       = "CloudMapServiceWithOwnTags"
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

}

data "aws_iam_policy_document" "deployer_allow" {
  for_each = var.deploy_environments

  # Names stack/ gives this environment (munaxa-<env>, munaxa-<env>-*, /munaxa/<env>/).
  statement {
    sid     = "OwnNames"
    actions = ["elasticloadbalancing:*", "ecs:*", "rds:*", "logs:*", "scheduler:*", "cloudwatch:*", "kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"]
    resources = [
      "${local.arn.elb}:loadbalancer/app/munaxa-${each.key}/*",
      "${local.arn.elb}:listener/app/munaxa-${each.key}/*",
      "${local.arn.elb}:listener-rule/app/munaxa-${each.key}/*",
      "${local.arn.elb}:targetgroup/munaxa-${each.key}-*",
      "${local.arn.ecs}:cluster/munaxa-${each.key}",
      "${local.arn.ecs}:service/munaxa-${each.key}/*",
      "${local.arn.ecs}:task/munaxa-${each.key}/*",
      "${local.arn.ecs}:task-definition/munaxa-${each.key}-*",
      "${local.arn.rds}:db:munaxa-${each.key}-*",
      "${local.arn.rds}:subgrp:munaxa-${each.key}",
      "${local.arn.rds}:pg:munaxa-${each.key}-*",
      "${local.arn.rds}:snapshot:munaxa-${each.key}-*",
      "${local.arn.logs}:log-group:/munaxa/${each.key}/*",
      "arn:aws:scheduler:${var.region}:${var.account_id}:schedule/*/munaxa-${each.key}-*",
      "arn:aws:cloudwatch:${var.region}:${var.account_id}:alarm:munaxa-${each.key}-*",
      "${local.arn.kms}:alias/munaxa-${each.key}-*",
    ]
  }

  # CreateDBInstance and ModifyDBInstance also authorize the engine's default option group.
  statement {
    sid       = "RdsDefaultOptionGroup"
    actions   = ["rds:CreateDBInstance", "rds:ModifyDBInstance"]
    resources = ["${local.arn.rds}:og:default:*"]
  }

  # Secret containers only (values: never, iam.tf). The RDS-managed master secret is created and
  # deleted by RDS on the deployer's behalf.
  statement {
    sid = "OwnSecretContainers"
    actions = [
      "secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:DescribeSecret",
      "secretsmanager:TagResource", "secretsmanager:UntagResource", "secretsmanager:UpdateSecret",
      "secretsmanager:GetResourcePolicy",
    ]
    resources = ["${local.arn.sm}:secret:munaxa-${each.key}/*"]
  }

  statement {
    sid       = "RdsMasterSecret"
    actions   = ["secretsmanager:CreateSecret", "secretsmanager:TagResource", "secretsmanager:DescribeSecret", "secretsmanager:DeleteSecret"]
    resources = ["${local.arn.sm}:secret:rds!*"]
    # RDS makes these calls with the deployer's credentials (a forward access session).
    # aws:CalledVia lists only a few services and RDS is not one of them, so this uses
    # aws:ViaAWSService: the deployer can never call these on an rds! secret directly.
    condition {
      test     = "Bool"
      variable = "aws:ViaAWSService"
      values   = ["true"]
    }
  }

  # RDS and Secrets Manager use this environment's data key on the deployer's behalf; the
  # deployer never decrypts anything directly.
  statement {
    sid       = "DataKeyThroughRdsAndSecretsManager"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:GenerateDataKeyWithoutPlaintext"]
    resources = ["${local.arn.kms}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["rds.${var.region}.amazonaws.com", "secretsmanager.${var.region}.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [each.key]
    }
  }

  # Cloud Map's private zone (stack/services.tf): Cloud Map creates and deletes it with the
  # caller's permissions. Records only under <env>.munaxa.internal.
  statement {
    sid       = "CloudMapPrivateZone"
    actions   = ["route53:CreateHostedZone", "route53:DeleteHostedZone", "route53:ChangeTagsForResource"]
    resources = ["*"]
  }

  # Cloud Map attaches and detaches the namespace's VPC and keeps the zone comment in step with
  # the namespace description (the Docs deployer has the same three). Route 53 has no tag or
  # name condition; route53:VPCs names VPC ids that exist only after G3, so the account's
  # protected VPCs are denied instead (iam.tf NeverProtectedVpcsInZones).
  statement {
    sid       = "CloudMapPrivateZoneVpc"
    actions   = ["route53:AssociateVPCWithHostedZone", "route53:DisassociateVPCFromHostedZone", "route53:UpdateHostedZoneComment"]
    resources = ["arn:aws:route53:::hostedzone/*"]
  }

  statement {
    sid       = "CloudMapPrivateZoneRecords"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = ["arn:aws:route53:::hostedzone/*"]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = ["${each.key}.munaxa.internal", "*.${each.key}.munaxa.internal"]
    }
  }

  # Finding H-1: roles only with this environment's name and boundary.
  statement {
    sid       = "OwnRolesWithOwnBoundary"
    actions   = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn[each.key]]
    }
  }

  statement {
    sid = "ManageOwnRoles"
    actions = [
      "iam:GetRole", "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:UpdateAssumeRolePolicy",
    ]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"]
  }

  statement {
    sid       = "PassOwnRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.account_id}:role/munaxa-shared/munaxa-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com", "ecs.amazonaws.com", "scheduler.amazonaws.com"]
    }
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
    resources = ["arn:aws:s3:::munaxa-${each.key}-*"]
  }
}

resource "aws_iam_policy" "deployer_allow_tagged" {
  for_each = var.deploy_environments

  name        = "${local.prefix}-deployer-${each.key}-allow-tagged"
  path        = "/munaxa-shared/bootstrap/"
  description = "What the ${each.key} deployer may change by tag: its own tags, or created with them (B2 / TD-14)"
  policy      = data.aws_iam_policy_document.deployer_allow_tagged[each.key].json
}

resource "aws_iam_role_policy_attachment" "deployer_allow_tagged" {
  for_each = var.deploy_environments

  role       = aws_iam_role.deployer[each.key].name
  policy_arn = aws_iam_policy.deployer_allow_tagged[each.key].arn
}

resource "aws_iam_policy" "deployer_allow" {
  for_each = var.deploy_environments

  name        = "${local.prefix}-deployer-${each.key}-allow"
  path        = "/munaxa-shared/bootstrap/"
  description = "What the ${each.key} deployer may change by name: its own environment's names (B2 / TD-14)"
  policy      = data.aws_iam_policy_document.deployer_allow[each.key].json
}

resource "aws_iam_role_policy_attachment" "deployer_allow" {
  for_each = var.deploy_environments

  role       = aws_iam_role.deployer[each.key].name
  policy_arn = aws_iam_policy.deployer_allow[each.key].arn
}
