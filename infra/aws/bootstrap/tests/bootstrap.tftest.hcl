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
}
