# Plan-only tests with a mocked AWS provider: no credentials, no AWS call. They check that each
# environment has its own CI role and deployer (R-17), and that the deployer is refused Docs
# Production (P9), the other environment and any other project (N-2).
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
      "repo:munaxa@311481412/munaxa-platform@1318353961:environment:aws-nonprod-session",
    ])
    error_message = "The nonprod CI role trusts only the nonprod GitHub environments."
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
      alltrue([for r in s.resources : !strcontains(r, "/prod/")]) if s.effect == "Allow" && s.sid == "State"
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
