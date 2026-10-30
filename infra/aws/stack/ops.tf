# Operator and release tasks: registered here, run by the deploy workflow or by the operator with
# `aws ecs run-task`. None is a service and none runs on its own.
#
# | Task              | Runs as                        | Reads                                       |
# | ----------------- | ------------------------------ | ------------------------------------------- |
# | db-admin          | RDS master user                | Master secret, every service's DB URLs      |
# | <product>-migrate | The product's owner role       | <env>/<product>-migrate                     |
#
# The db-admin task is the only principal that can read the RDS master secret. Its script is
# scripts/db-bootstrap.sh, written into the task definition so the reviewed text is what runs.

locals {
  # Which bundle holds each product's runtime URL.
  app_bundle = { identity = "identity", control = "control-api", work = "work-api", school = "school-api" }
}

resource "aws_cloudwatch_log_group" "ops" {
  name              = "/munaxa/${var.environment}/ops"
  retention_in_days = var.log_retention_days
}

resource "aws_security_group" "db_admin" {
  name        = "${local.prefix}-db-admin"
  description = "The db-admin task: 5432 to the database, 443 to AWS APIs, no inbound"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.prefix}-db-admin" }
}

resource "aws_vpc_security_group_egress_rule" "db_admin_https" {
  security_group_id = aws_security_group.db_admin.id
  description       = "HTTPS: ECR Public, Secrets Manager, logs"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "db_admin_database" {
  security_group_id            = aws_security_group.db_admin.id
  description                  = "PostgreSQL"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_db_admin" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from the db-admin task"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.db_admin.id
}

resource "aws_iam_role" "db_admin_execution" {
  name                 = "${local.prefix}-db-admin-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "db_admin_execution" {
  name = "execution"
  role = aws_iam_role.db_admin_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadMasterAndDatabaseUrls"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = concat(
          [aws_db_instance.main.master_user_secret[0].secret_arn],
          [for k in ["identity", "control-api", "work-api", "school-api", "identity-migrate", "control-migrate", "work-migrate", "school-migrate"] : aws_secretsmanager_secret.service[k].arn],
        )
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

resource "aws_ecs_task_definition" "db_admin" {
  count = var.postgres_image == "" ? 0 : 1

  family                   = "${local.prefix}-db-admin"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.db_admin_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "db-admin"
    image                  = var.postgres_image
    essential              = true
    user                   = "999:999"
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    entryPoint             = ["sh", "-c"]
    command                = [file("${path.module}/scripts/db-bootstrap.sh")]
    environment = [
      { name = "PGHOST", value = aws_db_instance.main.address },
      { name = "PGPORT", value = tostring(aws_db_instance.main.port) },
      { name = "HOME", value = "/tmp" },
    ]
    secrets = concat(
      [
        { name = "PGUSER", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
      ],
      [for p, bundle in local.app_bundle : {
        name      = "${upper(p)}_APP_URL"
        valueFrom = "${aws_secretsmanager_secret.service[bundle].arn}:DATABASE_URL::${lookup(var.secret_version_ids, bundle, "")}"
      } if contains(var.db_bootstrap_products, p)],
      [for p, bundle in local.app_bundle : {
        name      = "${upper(p)}_OWNER_URL"
        valueFrom = "${aws_secretsmanager_secret.service["${p}-migrate"].arn}:DATABASE_MIGRATION_URL::${lookup(var.secret_version_ids, "${p}-migrate", "")}"
      } if contains(var.db_bootstrap_products, p)],
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "db-admin"
      }
    }
  }])
}

# --- Migrations ----------------------------------------------------------------------------------
#
# Each product's `migrate` image target runs `prisma migrate deploy` as its owner role (Control
# already has one; Identity, Work and School gain one in their AWS hosting PRs). Clean databases
# get the whole migration history: no data is copied from Supabase or Render (test data only).

module "migrate" {
  source   = "../modules/service"
  for_each = { for p in ["identity", "work", "school"] : p => var.images["${p}_migrate"] if var.images["${p}_migrate"] != "" }

  prefix                     = local.common.prefix
  region                     = local.common.region
  account_id                 = var.account_id
  cluster_arn                = local.common.cluster_arn
  vpc_id                     = local.common.vpc_id
  subnet_ids                 = local.common.subnet_ids
  database_security_group_id = local.common.database_security_group_id
  secrets_kms_key_arn        = local.common.secrets_kms_key_arn
  log_retention_days         = local.common.log_retention_days

  name                     = "${each.key}-migrate"
  image                    = each.value
  readonly_root_filesystem = false
  environment              = { NODE_ENV = "production" }
  secret_arn               = aws_secretsmanager_secret.service["${each.key}-migrate"].arn
  # Each product's migrate target points Prisma at DATABASE_MIGRATION_URL.
  secret_keys       = local.secret_keys["${each.key}-migrate"]
  secret_version_id = lookup(var.secret_version_ids, "${each.key}-migrate", "")

  create_service   = false
  connect_database = true
}

# --- Identity's first operator (run-only) --------------------------------------------------------
#
# Identity's bootstrap scripts (munaxa-identity docs/runbooks/aws.md, "Operator organisation and
# Control roles"), run from the runtime image as identity_owner. The operator's email and password
# come from a one-run secret, munaxa-<env>/identity-bootstrap (IDENTITY_OWNER_EMAIL,
# IDENTITY_OWNER_PASSWORD), which the owner creates before the runs and deletes after them, never
# from a run-task environment override (reviewer R-16). The default command is step 1; steps 2 and
# 3 override only the command, whose arguments are not secret. Run with db_admin_group.

resource "aws_iam_role" "identity_bootstrap_execution" {
  count = local.defined.identity_api ? 1 : 0

  name                 = "${local.prefix}-identity-bootstrap-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "identity_bootstrap_execution" {
  count = local.defined.identity_api ? 1 : 0

  name = "execution"
  role = aws_iam_role.identity_bootstrap_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrSignIn", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid      = "PullIdentityApi"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-identity/api"
      },
      {
        Sid    = "ReadOwnerUrlAndOneRunSecret"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["identity-migrate"].arn,
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap-??????",
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

resource "aws_ecs_task_definition" "identity_bootstrap" {
  count = local.defined.identity_api ? 1 : 0

  family                   = "${local.prefix}-identity-bootstrap"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.identity_bootstrap_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "identity-bootstrap"
    image                  = var.images.identity_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    command                = ["node", "scripts/bootstrap-account.mjs", "--organisation", var.identity_operator_organisation.slug, "--organisation-name", var.identity_operator_organisation.name]
    environment = [
      { name = "NODE_ENV", value = "production" },
    ]
    secrets = [
      { name = "DIRECT_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.service["identity-migrate"].arn}:DATABASE_MIGRATION_URL::${lookup(var.secret_version_ids, "identity-migrate", "")}" },
      { name = "IDENTITY_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_EMAIL::" },
      { name = "IDENTITY_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_PASSWORD::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "identity-bootstrap"
      }
    }
  }])
}

# --- School's first platform owner (run-only) ----------------------------------------------------
#
# School's seeds (its seed-environment.yml steps: prisma/seed.ts, then
# scripts/seed-platform-owner.ts), run from the School migrate image, which carries the sources and
# tsx, as school_owner (the seeds write across tenants). A CI runner cannot reach the private
# database, so this task replaces that workflow on AWS. PLATFORM_OWNER_EMAIL and
# PLATFORM_OWNER_PASSWORD come from a one-run secret, munaxa-<env>/school-bootstrap, which the
# owner creates before the run and deletes after it; the script's development defaults never apply,
# because the task does not start without the secret. Run with db_admin_group, after school-migrate.

resource "aws_iam_role" "school_bootstrap_execution" {
  count = local.defined.school_migrate ? 1 : 0

  name                 = "${local.prefix}-school-bootstrap-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "school_bootstrap_execution" {
  count = local.defined.school_migrate ? 1 : 0

  name = "execution"
  role = aws_iam_role.school_bootstrap_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrSignIn", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid      = "PullSchoolMigrate"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-school/migrate"
      },
      {
        Sid    = "ReadOwnerUrlAndOneRunSecret"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["school-migrate"].arn,
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/school-bootstrap-??????",
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

resource "aws_ecs_task_definition" "school_bootstrap" {
  count = local.defined.school_migrate ? 1 : 0

  family                   = "${local.prefix}-school-bootstrap"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.school_bootstrap_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "school-bootstrap"
    image                  = var.images.school_migrate
    essential              = true
    readonlyRootFilesystem = false # tsx compiles into its cache
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    # Working directory /repo/apps/api (the migrate target). The owner URL is the seeds' connection.
    # No environment: NODE_ENV inherits production from the image, and no seed reads it.
    entryPoint = ["sh", "-c"]
    command = [join(" && ", [
      "export DATABASE_URL=\"$DATABASE_MIGRATION_URL\" DIRECT_DATABASE_URL=\"$DATABASE_MIGRATION_URL\"",
      "./node_modules/.bin/tsx ../../prisma/seed.ts",
      "exec ./node_modules/.bin/tsx scripts/seed-platform-owner.ts",
    ])]
    secrets = [
      { name = "DATABASE_MIGRATION_URL", valueFrom = "${aws_secretsmanager_secret.service["school-migrate"].arn}:DATABASE_MIGRATION_URL::${lookup(var.secret_version_ids, "school-migrate", "")}" },
      { name = "PLATFORM_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/school-bootstrap:PLATFORM_OWNER_EMAIL::" },
      { name = "PLATFORM_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/school-bootstrap:PLATFORM_OWNER_PASSWORD::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "school-bootstrap"
      }
    }
  }])
}
