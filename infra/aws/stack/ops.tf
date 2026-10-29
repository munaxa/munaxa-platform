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
