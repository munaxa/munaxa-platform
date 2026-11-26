# Munaxa Work demo starter data for Testing (owner request, 26 Nov 2026: "bring Work to the same
# state as Docs"; the Docs counterpart is munaxa-docs seed:demo, report
# 2026-11-25-docs-demo-starter-configuration). Off unless work_demo_data_enabled is true, which
# only envs/nonprod.tfvars sets; production never has these tasks.
#
# | Task              | Image            | Does                                                    | Reads                                  |
# | ----------------- | ---------------- | ------------------------------------------------------- | -------------------------------------- |
# | work-demo-account | Identity api     | bootstrap-account.mjs: creates the synthetic loader     | identity-migrate owner URL (pinned),   |
# |                   |                  | account in the operator organisation with the Testing   | work-demo-loader/<org> (one run)       |
# |                   |                  | persona role work-testing-org-admin (MW-003)            |                                        |
# | work-demo-loader  | Work api         | tooling/testing-data/load-synthetic.mjs (MW-004): signs | work-demo-loader/<org> (one run)       |
# |                   |                  | in through Identity on the work host and loads the      |                                        |
# |                   |                  | synthetic dataset through the Work API, idempotently    |                                        |
#
# Why a separate account and not the operator: the operator holds control-operator-admin, which
# Identity's MFA policy ("privileged") covers, so a password-only sign-in cannot work for it, and
# the operator's password must never be readable by a data loader. The loader account holds one
# Testing persona role, which the MFA policy does not cover, and no Control role.
#
# The one-run secret munaxa-<env>/work-demo-loader/<org slug> holds LOADER_IDENTIFIER (a synthetic
# address under example.test, RFC 2606) and LOADER_PASSWORD (generated in AWS by
# secretsmanager:GetRandomPassword, never displayed). It is created right before the two runs and
# deleted right after them, like docs-provision/<slug>; its random suffix is unknown, so it is read
# by name. The loader prints codes and counts only (munaxa-work tooling/testing-data/README.md).
#
# Run order, inside a Testing session, after work-migrate, the Work tenant bootstrap and
# identity-bootstrap's seed-work-roles --testing-personas: work-demo-account with db_admin_group,
# then work-demo-loader with work_api_group (dry run first: command override adding --dry-run;
# the command's arguments are not secret).

variable "work_demo_data_enabled" {
  description = "Testing only: define the run-only work-demo-account and work-demo-loader tasks (Work demo starter data). Never true in production."
  type        = bool
  default     = false
}

locals {
  work_demo_defined = var.work_demo_data_enabled && local.defined.work_api && local.defined.identity_api
  work_demo_keys    = ["LOADER_IDENTIFIER", "LOADER_PASSWORD"]
  work_demo_secret  = "${local.prefix}/work-demo-loader/${var.identity_operator_organisation.slug}"
}

resource "aws_iam_role" "work_demo_execution" {
  count = local.work_demo_defined ? 1 : 0

  name                 = "${local.prefix}-work-demo-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "work_demo_execution" {
  count = local.work_demo_defined ? 1 : 0

  name = "execution"
  role = aws_iam_role.work_demo_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrSignIn", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid    = "PullIdentityAndWorkApi"
        Effect = "Allow"
        Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = [
          "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-identity/api",
          "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-work/api",
        ]
      },
      {
        Sid    = "ReadOwnerUrlAndLoaderSecret"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["identity-migrate"].arn,
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.work_demo_secret}-??????",
        ]
      },
      {
        Sid       = "DecryptThroughSecretsManager"
        Effect    = "Allow"
        Action    = "kms:Decrypt"
        Resource  = aws_kms_key.data.arn
        Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" } }
      },
      {
        Sid      = "WriteLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.ops.arn}:*"
      },
    ]
  })
}

resource "aws_ecs_task_definition" "work_demo_account" {
  count = local.work_demo_defined ? 1 : 0

  family                   = "${local.prefix}-work-demo-account"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.work_demo_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "work-demo-account"
    image                  = var.images.identity_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    command                = ["node", "scripts/bootstrap-account.mjs", "--organisation", var.identity_operator_organisation.slug, "--role", "work-testing-org-admin"]
    environment = [
      { name = "NODE_ENV", value = "production" },
    ]
    secrets = [
      { name = "DIRECT_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.service["identity-migrate"].arn}:DATABASE_MIGRATION_URL::${lookup(var.secret_version_ids, "identity-migrate", "")}" },
      { name = "IDENTITY_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.work_demo_secret}:LOADER_IDENTIFIER::" },
      { name = "IDENTITY_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.work_demo_secret}:LOADER_PASSWORD::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "work-demo-account"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "work_demo_loader" {
  count = local.work_demo_defined ? 1 : 0

  family                   = "${local.prefix}-work-demo-loader"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.work_demo_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "work-demo-loader"
    image                  = var.images.work_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    # The runtime image's working directory is /app/apps/api; the loader uses Node built-ins only.
    command = ["node", "../../tooling/testing-data/load-synthetic.mjs"]
    environment = [
      { name = "NODE_ENV", value = "production" },
      # Identity is served on the work host under /api/auth (ALB rule 50), as a browser signs in.
      { name = "WORK_BASE_URL", value = local.https.work },
      { name = "IDENTITY_ORGANISATION", value = var.identity_operator_organisation.slug },
    ]
    secrets = [for k in local.work_demo_keys : { name = k, valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.work_demo_secret}:${k}::" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "work-demo-loader"
      }
    }
  }])
}
