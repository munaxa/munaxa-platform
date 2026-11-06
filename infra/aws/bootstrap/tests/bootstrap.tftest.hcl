# Plan-only tests with a mocked AWS provider: no credentials, no AWS call. They check that each
# environment has its own CI role and deployer (R-17), and that the deployer is refused Docs
# Production (P9), the other environment and any other project (N-2); that its writes are an
# allow-list by name or by its own tags, never a bare service:* on "*" (B2 / TD-14); that each
# environment has its own workload boundary (H-1); that the state key and bucket are protected
# (H-2); and that Testing sessions have their own narrow CI role and deployer (H-3).
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::229251310592:oidc-provider/token.actions.githubusercontent.com"
    }
  }
  # The state bucket's ARN is named in the deployer policy; give it one at plan time.
  override_resource {
    target          = aws_s3_bucket.state
    override_during = plan
    values          = { arn = "arn:aws:s3:::munaxa-shared-tfstate-229251310592" }
  }
  override_resource {
    target          = aws_kms_key.state
    override_during = plan
    values          = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
}

run "one_ci_role_and_one_deployer_per_environment" {
  command = plan

  assert {
    condition     = toset(keys(aws_iam_role.ci)) == toset(["nonprod", "prod"]) && toset(keys(aws_iam_role.deployer)) == toset(["nonprod", "prod"])
    error_message = "nonprod and prod each have a CI role and a deployer."
  }

  assert {
    condition     = aws_iam_role.ci["nonprod"].name == "munaxa-shared-ci-nonprod" && aws_iam_role.deployer["prod"].name == "munaxa-shared-deployer-prod"
    error_message = "Role names carry their environment."
  }

  assert {
    condition     = length(aws_ecr_repository.image) == 11 && length(aws_ecr_lifecycle_policy.image) == 11 && length(aws_iam_role.publisher) == 4
    error_message = "Bootstrap creates 11 ECR repositories with lifecycle policies and four image publishers (49 resources in all, README G2)."
  }

  assert {
    condition = toset(flatten([
      for s in data.aws_iam_policy_document.ci_trust["nonprod"].statement : [
        for c in s.condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"
      ]
      ])) == toset([
      "repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod",
    ])
    error_message = "The nonprod CI role trusts only aws-nonprod (Testing sessions have their own role, H-3)."
  }

  assert {
    condition = toset(flatten([
      for s in data.aws_iam_policy_document.ci_session_trust["nonprod"].statement : [
        for c in s.condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"
      ]
      ])) == toset([
      "repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod-session",
    ]) && toset(keys(aws_iam_role.ci_session)) == toset(["nonprod"]) && toset(keys(aws_iam_role.deployer_session)) == toset(["nonprod"])
    error_message = "Only nonprod has a session CI role, and it trusts only aws-nonprod-session."
  }

  assert {
    condition = toset(flatten([
      for s in data.aws_iam_policy_document.ci_trust["prod"].statement : [
        for c in s.condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"
      ]
    ])) == toset(["repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-prod"])
    error_message = "The prod CI role trusts only aws-prod."
  }
}

run "the_deployer_never_reaches_docs_production_or_the_other_environment" {
  command = plan

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length(setsubtract(
        ["NeverMunaxaDocsOrBootstrap", "NeverMunaxaDocsProductionByTag", "NeverTagAsMunaxaDocs", "NeverTheOtherEnvironmentByTag", "NeverCreateForTheOtherEnvironment", "NeverTheOtherEnvironmentByName"],
        [for s in data.aws_iam_policy_document.deployer[env].statement : s.sid if s.effect == "Deny"]
      )) == 0
    ])
    error_message = "Every deployer denies Docs Production (by name and by tag) and the other environment."
  }

  assert {
    condition = one(flatten([
      for s in data.aws_iam_policy_document.deployer["nonprod"].statement : [
        for c in s.condition : c.values if c.variable == "aws:ResourceTag/Project"
      ] if s.sid == "NeverMunaxaDocsProductionByTag"
    ])) == "MunaxaDocs"
    error_message = "P9: anything tagged Project = MunaxaDocs is denied."
  }

  assert {
    condition = one(flatten([
      for s in data.aws_iam_policy_document.deployer["nonprod"].statement : [
        for c in s.condition : c.values if c.variable == "aws:ResourceTag/Environment"
      ] if s.sid == "NeverTheOtherEnvironmentByTag"
    ])) == "prod"
    error_message = "The nonprod deployer is denied what is tagged prod."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deployer["nonprod"].statement :
      s.resources == toset(["arn:aws:s3:::munaxa-shared-tfstate-229251310592/nonprod/*"]) if s.effect != "Deny" && s.sid == "State"
    ])
    error_message = "The nonprod deployer reads and writes nonprod state only."
  }

  assert {
    condition = contains(one([
      for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.resources if s.sid == "NeverTheOtherEnvironmentByName"
    ]), "arn:aws:s3:::munaxa-shared-tfstate-229251310592/prod/*")
    error_message = "The nonprod deployer is denied prod state by name."
  }
}

run "the_deployer_never_reaches_another_project" {
  command = plan

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length(setsubtract(
        ["NeverAnotherProjectByTag", "NeverTagForAnotherProject"],
        [for s in data.aws_iam_policy_document.deployer[env].statement : s.sid if s.effect == "Deny"]
      )) == 0
    ])
    error_message = "N-2: every deployer denies other projects by tag."
  }

  assert {
    condition = one(flatten([
      for s in data.aws_iam_policy_document.deployer["prod"].statement : [
        for c in s.condition : c.values if c.variable == "aws:ResourceTag/Project" && c.test == "StringNotEquals"
      ] if s.sid == "NeverAnotherProjectByTag"
    ])) == "munaxa"
    error_message = "N-2: anything tagged with a Project other than munaxa is denied."
  }

  assert {
    condition = one(flatten([
      for s in data.aws_iam_policy_document.deployer["nonprod"].statement : [
        for c in s.condition : c.values if c.variable == "aws:RequestTag/Project" && c.test == "StringNotEquals"
      ] if s.sid == "NeverTagForAnotherProject"
    ])) == "munaxa"
    error_message = "N-2: the deployer may not create or tag a resource for another project."
  }

  assert {
    condition = alltrue(flatten([
      for env in ["nonprod", "prod"] : [
        for s in data.aws_iam_policy_document.deployer[env].statement : anytrue([
          for c in s.condition : c.test == "Null" && c.values == tolist(["false"]) && c.variable == (s.sid == "NeverAnotherProjectByTag" ? "aws:ResourceTag/Project" : "aws:RequestTag/Project")
        ]) if contains(["NeverAnotherProjectByTag", "NeverTagForAnotherProject"], s.sid)
      ]
    ]))
    error_message = "N-2: a missing Project tag must not match the deny (StringNotEquals is true on a missing key)."
  }
}

run "testing_has_its_own_budget" {
  command = plan

  assert {
    condition     = aws_budgets_budget.testing.limit_amount == "50" && one(aws_budgets_budget.testing.cost_filter).values == tolist(["user:Environment$nonprod"])
    error_message = "Testing has a US$50 budget on its Environment = nonprod tag, beside the account budget."
  }

  assert {
    condition     = aws_budgets_budget.account.limit_amount == "50"
    error_message = "The account budget is unchanged."
  }
}

run "b2_writes_are_an_allow_list_not_tag_denies" {
  command = plan

  # No allow grants a whole service's writes on "*" without a condition (the old StackServices).
  assert {
    condition = alltrue(flatten([
      for env in ["nonprod", "prod"] : [
        for s in concat(data.aws_iam_policy_document.deployer_allow[env].statement, data.aws_iam_policy_document.deployer_allow_tagged[env].statement, data.aws_iam_policy_document.deployer[env].statement) :
        length(s.condition) > 0 || !contains(s.resources, "*") || length(setintersection(s.actions, ["ec2:*", "elasticloadbalancing:*", "ecs:*", "rds:*", "logs:*", "acm:*", "servicediscovery:*", "scheduler:*", "cloudwatch:*", "kms:PutKeyPolicy", "kms:ScheduleKeyDeletion", "kms:CreateGrant"])) == 0
        if s.effect != "Deny" # effect is unset (Allow) in the configuration
      ]
    ]))
    error_message = "B2: no service-wide write on \"*\" without a condition."
  }

  # Allow statements on "*" with no condition are only the residual Cloud Map zone calls.
  assert {
    condition = alltrue(flatten([
      for env in ["nonprod", "prod"] : [
        for s in concat(data.aws_iam_policy_document.deployer_allow[env].statement, data.aws_iam_policy_document.deployer_allow_tagged[env].statement) :
        s.sid == "CloudMapPrivateZone" if s.effect != "Deny" && contains(s.resources, "*") && length(s.condition) == 0
      ]
    ]))
    error_message = "B2: the only unconditioned allow on \"*\" is the documented Cloud Map zone residual."
  }

  # Writes by tag need BOTH the Project and the Environment tag, as an allow (StringEquals).
  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in data.aws_iam_policy_document.deployer_allow_tagged[env].statement : (
          anytrue([for c in s.condition : c.test == "StringEquals" && c.values == tolist(["munaxa"]) && contains(["aws:ResourceTag/Project", "aws:RequestTag/Project"], c.variable)]) &&
          anytrue([for c in s.condition : c.test == "StringEquals" && c.values == tolist([env]) && contains(["aws:ResourceTag/Environment", "aws:RequestTag/Environment"], c.variable)])
        )
      ])
    ])
    error_message = "B2: every tag-scoped allow requires Project = munaxa and Environment = <env> (StringEquals)."
  }

  # Each EC2 create statement creates one resource type only, so a parent (a VPC, a security
  # group) is never admitted by the request tags of its child.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deployer_allow_tagged["nonprod"].statement :
      length(s.resources) == 1 && can(regex("^arn:aws:ec2:eu-central-1:229251310592:[a-z-]+/\\*$", one(s.resources))) if startswith(s.sid, "Ec2Create")
    ]) && length([for s in data.aws_iam_policy_document.deployer_allow_tagged["nonprod"].statement : s if startswith(s.sid, "Ec2Create")]) == 7
    error_message = "B2: seven EC2 create statements, each on one resource type."
  }

  # Writes by name use this environment's names only.
  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for r in one([for s in data.aws_iam_policy_document.deployer_allow[env].statement : s.resources if s.sid == "OwnNames"]) :
        strcontains(r, "munaxa-${env}") || strcontains(r, "/munaxa/${env}/")
      ])
    ])
    error_message = "B2: OwnNames lists only the environment's own names."
  }

  # Every create that takes tags must carry Project and Environment (M-1).
  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length(setsubtract(["CreatesCarryProjectTag", "CreatesCarryEnvironmentTag", "NeverAccountSettingsOrSharing", "NeverProtectedVpcs", "NeverInProtectedVpcs", "ProtectStateKeyAndBucket"],
      [for s in data.aws_iam_policy_document.deployer[env].statement : s.sid if s.effect == "Deny"])) == 0
    ])
    error_message = "M-1/H-2: the create-tag, account-settings, protected-VPC and state guardrails exist on both deployers."
  }

  # G3 recovery: the create-tag denies never apply to the EC2 parents of a create (VPC, subnet,
  # security group, route table), where EC2 puts no request tags in the context; everything
  # else they cover, including the created VPC endpoint and internet gateway, stays denied.
  assert {
    condition = alltrue(flatten([
      for env in ["nonprod", "prod"] : [
        for s in data.aws_iam_policy_document.deployer[env].statement :
        s.resources == null && toset(s.not_resources) == toset([
          "arn:aws:ec2:eu-central-1:229251310592:vpc/*",
          "arn:aws:ec2:eu-central-1:229251310592:subnet/*",
          "arn:aws:ec2:eu-central-1:229251310592:security-group/*",
          "arn:aws:ec2:eu-central-1:229251310592:route-table/*",
        ]) && contains(s.actions, "ec2:CreateSubnet") && contains(s.actions, "rds:CreateDBInstance")
        if contains(["CreatesCarryProjectTag", "CreatesCarryEnvironmentTag"], s.sid)
      ]
    ]))
    error_message = "G3 recovery: CreatesCarry* exclude exactly the four EC2 parent types and still cover every tagged create."
  }

  assert {
    condition     = contains(one([for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.actions if s.sid == "NeverAccountSettingsOrSharing"]), "rds:ModifyDBSnapshotAttribute") && contains(one([for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.actions if s.sid == "NeverAccountSettingsOrSharing"]), "ec2:ModifySnapshotAttribute")
    error_message = "M-1: snapshot sharing is denied."
  }

  assert {
    condition     = contains(one([for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.resources if s.sid == "NeverMunaxaDocsOrBootstrap"]), "arn:aws:rds:eu-central-1:229251310592:snapshot:munaxa-docs*")
    error_message = "M-1: the kept Docs final snapshot is denied by name."
  }

  assert {
    condition     = contains(one([for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.resources if s.sid == "NeverProtectedVpcs"]), "arn:aws:ec2:eu-central-1:229251310592:vpc/vpc-0ed30515ad9631ea6")
    error_message = "The account's default VPC is never changed."
  }
}

run "h2_state_key_and_bucket_are_protected" {
  command = plan

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length(setsubtract(
        ["arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000", "arn:aws:s3:::munaxa-shared-tfstate-229251310592", "arn:aws:s3:::munaxa-shared-tfstate-229251310592/*"],
        one([for s in data.aws_iam_policy_document.deployer[env].statement : s.resources if s.sid == "ProtectStateKeyAndBucket"])
      )) == 0
    ])
    error_message = "H-2: both deployers are denied everything but state object access on the state key and bucket."
  }

  assert {
    condition = alltrue([
      for a in one([for s in data.aws_iam_policy_document.deployer["nonprod"].statement : s.not_actions if s.sid == "ProtectStateKeyAndBucket"]) :
      contains(["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey", "s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"], a)
    ])
    error_message = "H-2: only state object reads and writes are exempt (no PutKeyPolicy, no ScheduleKeyDeletion, no bucket policy)."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length([
        for s in data.aws_iam_policy_document.deployer[env].statement : s.sid
        if s.sid == "NeverSharedAliases" && s.effect == "Deny"
        && length(setsubtract(["kms:CreateAlias", "kms:UpdateAlias", "kms:DeleteAlias"], s.actions)) == 0
        && length(setsubtract(["arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-*", "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-000000000000"], s.resources)) == 0
      ]) == 1
    ])
    error_message = "H-2b: both deployers are denied creating, repointing or deleting a munaxa-shared alias, and any alias on the state key."
  }
}

run "h1_each_environment_has_its_own_boundary" {
  command = plan

  assert {
    condition     = aws_iam_policy.workload_boundary["nonprod"].name == "munaxa-shared-workload-boundary" && aws_iam_policy.workload_boundary["prod"].name == "munaxa-shared-workload-boundary-prod"
    error_message = "H-1: nonprod keeps the boundary name stack/ uses; prod has its own."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in jsondecode(aws_iam_policy.workload_boundary[env].policy).Statement :
        !strcontains(jsonencode(s), "munaxa-${local.other_environment[env]}") if s.Effect == "Allow"
      ])
    ])
    error_message = "H-1: a boundary allows nothing named for the other environment."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in jsondecode(aws_iam_policy.workload_boundary[env].policy).Statement : alltrue([
          for r in flatten([s.Resource]) : strcontains(r, "munaxa-${env}") || strcontains(r, "/munaxa/${env}/") || r == "*" || endswith(r, "repository/munaxa-*") || endswith(r, "secret:rds!*") || endswith(r, ":key/*")
        ]) if s.Effect == "Allow"
      ])
    ])
    error_message = "H-1: every boundary allow names its own environment (or is ECR sign-in/pull, the tag-conditioned RDS secret or keys)."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in jsondecode(aws_iam_policy.workload_boundary[env].policy).Statement :
        s.Condition.StringEquals["aws:ResourceTag/Environment"] == env if s.Sid == "OwnKeys"
      ])
    ])
    error_message = "H-1: a boundary decrypts and signs only with its own environment's keys."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : one(flatten([
        for s in data.aws_iam_policy_document.deployer_allow[env].statement : [
          for c in s.condition : c.values if c.variable == "iam:PermissionsBoundary"
        ] if s.sid == "OwnRolesWithOwnBoundary"
      ])) == "arn:aws:iam::229251310592:policy/munaxa-shared/${aws_iam_policy.workload_boundary[env].name}"
    ])
    error_message = "H-1: a deployer creates roles only with its own environment's boundary."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in data.aws_iam_policy_document.deployer_allow[env].statement : alltrue([
          for r in s.resources : r == "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-${env}-*"
        ]) if contains(["OwnRolesWithOwnBoundary", "ManageOwnRoles", "PassOwnRoles"], s.sid)
      ])
    ])
    error_message = "H-1: a deployer creates, changes and passes only roles named for its environment."
  }
}

run "h3_sessions_have_a_narrow_deployer" {
  command = plan

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : [
        for a in s.actions : !startswith(a, "kms:") && !startswith(a, "secretsmanager:") && !startswith(a, "s3:Put") && !startswith(a, "logs:") && (!startswith(a, "iam:") || a == "iam:PassRole") && !contains(["ec2:*", "ecs:*", "rds:*", "ecs:RegisterTaskDefinition", "ec2:CreateVpc", "ec2:CreateSecurityGroup", "rds:DeleteDBInstance", "rds:ModifyDBInstance"], a)
      ] if s.effect != "Deny" && !contains(["State", "StateList", "StateKey"], s.sid)
    ]))
    error_message = "H-3: the session deployer changes no IAM, KMS, secret, bucket, log, network or database configuration."
  }

  # The session deployer's guardrails are the nonprod deployer's whole document
  # (source_policy_documents). A mocked plan cannot render it; the phase 5 evidence checks the
  # rendered policy (every Deny of the nonprod deployer is in it, unchanged).
  assert {
    condition     = length(data.aws_iam_policy_document.deployer_session["nonprod"].source_policy_documents) == 1
    error_message = "H-3: the session deployer carries the nonprod deployer's guardrails as its source document."
  }

  # Review R10 (phase 6): no security-group rule action is allowed, and all are denied.
  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : [
        for a in s.actions : !strcontains(a, "SecurityGroup") && a != "ec2:*" && a != "*"
      ] if s.effect != "Deny"
    ]))
    error_message = "R10: a session allows no security-group rule action."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : s.sid
      if s.sid == "SessionNeverSecurityGroupRules" && s.effect == "Deny" && contains(s.resources, "*")
      && length(setsubtract(["ec2:AuthorizeSecurityGroupIngress", "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupIngress", "ec2:RevokeSecurityGroupEgress", "ec2:ModifySecurityGroupRules"], s.actions)) == 0
      ]) == 1 && length([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : s.sid
      if s.sid == "SessionNeverGroupTags" && s.effect == "Deny" && contains(s.resources, "arn:aws:ec2:eu-central-1:229251310592:security-group/*")
    ]) == 1
    error_message = "R10: the session is denied every security-group rule write, and never retags a group."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : s.sid
      if s.sid == "SessionNeverNetworkPlacement" && s.effect == "Deny" && contains(s.resources, "*")
      && length(setsubtract(["elasticloadbalancing:SetSecurityGroups", "elasticloadbalancing:SetSubnets", "ec2:ModifyNetworkInterfaceAttribute", "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup"], s.actions)) == 0
    ]) == 1
    error_message = "P4: the session never moves an ALB, a service or an interface to another group or subnet."
  }

  # Review B-2: a session plan refreshes the whole stack; its extra reads are reads, on nonprod only.
  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.deployer_session_read["nonprod"].statement : concat(
        [for a in s.actions : can(regex(":(Get|List|Describe)", a))],
        [for r in s.resources : strcontains(r, "munaxa-nonprod") || r == "arn:aws:kms:eu-central-1:229251310592:key/*"],
        [s.effect != "Deny"]
      )
    ]))
    error_message = "B-2: the session refresh policy reads only, and only nonprod resources (keys by tag)."
  }

  assert {
    condition = length(setsubtract(
      ["kms:DescribeKey", "kms:GetKeyPolicy", "kms:GetKeyRotationStatus", "kms:ListResourceTags", "secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy", "s3:GetBucket*", "s3:GetLifecycleConfiguration", "s3:GetEncryptionConfiguration", "iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"],
      flatten([for s in data.aws_iam_policy_document.deployer_session_read["nonprod"].statement : s.actions])
    )) == 0 && aws_iam_role_policy_attachment.deployer_session_refresh["nonprod"].role == "munaxa-shared-deployer-nonprod-session"
    error_message = "B-2: the session deployer can refresh the persistent layer (keys, secrets, bucket, roles)."
  }
}

run "b1_rds_master_secret_only_through_rds" {
  command = plan

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length([
        for s in data.aws_iam_policy_document.deployer_allow[env].statement : s.sid
        if s.sid == "RdsMasterSecret" && length(s.condition) == 1 && alltrue([for c in s.condition : c.test == "Bool" && c.variable == "aws:ViaAWSService" && c.values == tolist(["true"])])
        && s.resources == toset(["arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!*"])
      ]) == 1
    ])
    error_message = "B-1: the RDS master secret is created only by RDS on the deployer's behalf (aws:ViaAWSService, not aws:CalledVia)."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : alltrue([
        for s in jsondecode(aws_iam_policy.workload_boundary[env].policy).Statement :
        jsonencode(s.Condition) == jsonencode({ StringEquals = { "aws:ResourceTag/Environment" = env, "aws:ResourceTag/Project" = "munaxa" } }) if s.Sid == "OwnRdsMasterSecretByTag"
      ]) && length([for s in jsondecode(aws_iam_policy.workload_boundary[env].policy).Statement : s if s.Sid == "OwnRdsMasterSecretByTag"]) == 1
    ])
    error_message = "N-1: the boundary also admits the RDS master secret by its own environment's tags."
  }

  assert {
    condition = alltrue([
      for env in ["nonprod", "prod"] : length([
        for s in data.aws_iam_policy_document.deployer_allow[env].statement : s.sid
        if s.sid == "SecretsManagerDefaultKeyMetadata" && s.actions == toset(["kms:DescribeKey"]) && length(s.condition) == 0
        && s.resources == toset(["arn:aws:kms:eu-central-1:229251310592:key/033b4382-b443-4527-a34e-41d91b62cfd5"])
      ]) == 1
    ])
    error_message = "G3 recovery: only kms:DescribeKey, only on the AWS managed Secrets Manager key."
  }

  assert {
    condition     = alltrue([for env in ["nonprod", "prod"] : length(data.aws_iam_policy_document.deployer_allow[env].minified_json) <= 6144])
    error_message = "A managed policy holds at most 6,144 characters."
  }
}

# Phase 6 (Agent 5): the nonprod boundary admits the AWS-side Testing backstop (stack/backstop.tf);
# prod's does not.
run "only_the_nonprod_boundary_admits_the_testing_backstop" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(aws_iam_policy.workload_boundary["nonprod"].policy).Statement : s
      if s.Sid == "TestingBackstop" && s.Effect == "Allow" && length(setsubtract(s.Action, ["rds:StopDBInstance", "ecs:UpdateService"])) == 0
    ]) == 1
    error_message = "The nonprod boundary allows the backstop's stop and scale-in, and nothing more in that statement."
  }

  assert {
    condition     = length([for s in jsondecode(aws_iam_policy.workload_boundary["prod"].policy).Statement : s if s.Sid == "TestingBackstop"]) == 0
    error_message = "Prod has no Testing backstop."
  }
}

# Phase 6 narrowing (R9, R11, R12): no data reads by name, Cloud Map request tags admit only a new
# service, and service-linked roles only for the stack's services.
run "phase6_residual_narrowing" {
  command = plan

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deployer_session["nonprod"].statement : s.sid
      if s.effect != "Deny" && contains(s.actions, "servicediscovery:CreateService") && contains(s.resources, "*")
      && length([for c in s.condition : c if startswith(c.variable, "aws:RequestTag/")]) > 0
    ]) == 0
    error_message = "R11: request tags never admit a session CreateService on a namespace."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deployer_allow["nonprod"].statement : s.sid
      if s.sid == "NoLogOrDatabaseData" && s.effect == "Deny" && contains(s.resources, "*")
      && length(setsubtract(["logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery", "logs:CreateExportTask", "logs:PutSubscriptionFilter", "rds:DownloadDBLogFilePortion", "ecs:ExecuteCommand"], s.actions)) == 0
      ]) == 1 && length([
      for s in data.aws_iam_policy_document.deployer_allow["prod"].statement : s.sid
      if s.sid == "NoLogOrDatabaseData" && s.effect == "Deny" && contains(s.resources, "*")
      && length(setsubtract(["logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery", "logs:CreateExportTask", "logs:PutSubscriptionFilter", "rds:DownloadDBLogFilePortion", "ecs:ExecuteCommand"], s.actions)) == 0
    ]) == 1
    error_message = "R9: no deployer reads log data or database log files, exports logs or opens ECS Exec."
  }

  assert {
    condition = toset(flatten([
      for s in concat(data.aws_iam_policy_document.deployer_allow["nonprod"].statement, data.aws_iam_policy_document.deployer_allow["prod"].statement) :
      s.resources if contains(s.actions, "iam:CreateServiceLinkedRole")
      ])) == toset([
      "arn:aws:iam::229251310592:role/aws-service-role/ecs.amazonaws.com/*",
      "arn:aws:iam::229251310592:role/aws-service-role/elasticloadbalancing.amazonaws.com/*",
      "arn:aws:iam::229251310592:role/aws-service-role/rds.amazonaws.com/*",
    ])
    error_message = "R12: service-linked roles only for ECS, Elastic Load Balancing and RDS."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deployer_allow["nonprod"].statement : s.sid
      if s.effect == "Deny" && (s.sid == "NeverExportCertificates" && contains(s.actions, "acm:ExportCertificate") || s.sid == "NoExportableCertificates" && contains(s.actions, "acm:RequestCertificate"))
      ]) == 2 && length([
      for s in data.aws_iam_policy_document.deployer_allow["prod"].statement : s.sid
      if s.effect == "Deny" && (s.sid == "NeverExportCertificates" && contains(s.actions, "acm:ExportCertificate") || s.sid == "NoExportableCertificates" && contains(s.actions, "acm:RequestCertificate"))
    ]) == 2
    error_message = "R13: no deployer requests an exportable certificate or exports one."
  }
}

# Phase 6 (R7): no boundary-bound role is usable from a session that carries a source identity
# (every deployer session does), so the deployer cannot assume a role it created.
run "r7_boundary_refuses_chained_deployer_sessions" {
  command = plan

  assert {
    condition = length([
      for s in jsondecode(aws_iam_policy.workload_boundary["nonprod"].policy).Statement : s.Sid
      if s.Sid == "NeverFromADeployerSession" && s.Effect == "Deny" && s.Action == "*" && s.Resource == "*"
      && try(s.Condition.Null["aws:SourceIdentity"], "") == "false"
      ]) == 1 && length([
      for s in jsondecode(aws_iam_policy.workload_boundary["prod"].policy).Statement : s.Sid
      if s.Sid == "NeverFromADeployerSession" && s.Effect == "Deny" && s.Action == "*" && s.Resource == "*"
      && try(s.Condition.Null["aws:SourceIdentity"], "") == "false"
    ]) == 1
    error_message = "R7: each workload boundary refuses every session that carries a source identity."
  }
}
