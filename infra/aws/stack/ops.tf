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
  # Work's migrate image also runs its first-tenant bootstrap (munaxa-work scripts/bootstrap-tenant.mjs,
  # through the E-1 guard), which refuses unless its --issuer equals PLATFORM_AUTH_ISSUER here: the
  # same value work-api verifies tokens against (MW-005).
  environment = merge(
    { NODE_ENV = "production" },
    each.key == "work" ? { PLATFORM_AUTH_ISSUER = local.https.identity } : {},
  )
  secret_arn = aws_secretsmanager_secret.service["${each.key}-migrate"].arn
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
# come from the persistent operator secret munaxa-<env>/identity-operator (its IDENTITY_OWNER_EMAIL
# and IDENTITY_OWNER_PASSWORD keys), never from a run-task environment override (reviewer R-16).
# L-A0 redesign (owner decision D-LA0, report 2026-11-15-identity-stage-e-owner-decisions, file 03):
# Secrets Manager generates the password through CloudFormation
# (infra/aws/cloudformation/identity-operator-secret.template.json, connector script C-8G), so there
# is no second, one-run copy any more. The secret's resource policy denies this role's read unless
# the owner has opened the stack's read window (C-8G open-window) for the bootstrap runs; it is
# closed again right after them. bootstrap-account.mjs checks the password against the real policy
# before it writes anything. The default command is step 1; steps 2 and 3 override only the
# command, whose arguments are not secret. Run with db_admin_group.

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
        Sid    = "ReadOwnerUrlAndOperatorSecret"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["identity-migrate"].arn,
          # Only while the secret's own resource policy has the read window open (C-8G).
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-operator-??????",
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
      { name = "IDENTITY_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-operator:IDENTITY_OWNER_EMAIL::" },
      { name = "IDENTITY_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-operator:IDENTITY_OWNER_PASSWORD::" },
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

# --- School's first school and administrator (run-only) ------------------------------------------
#
# munaxa-school#34 removed School's own platform console and its platform-owner seed: Munaxa
# operators manage School customers, plans and licences in Control, and a school's staff sign in
# with Munaxa Identity only (school#33). A school and its first SchoolAdmin (no School password) are
# created by `node dist/ops/provision-school.js` from the School API image (munaxa-school
# docs/ops/new-school.md), with the API's own database settings (school_app; the script writes in
# the platform RLS context like every School seed). It is idempotent and never changes an existing
# user. The school's slug and name are not secret and come from school_provision; ADMIN_EMAIL is a
# person's address, so it comes from a one-run secret munaxa-<env>/school-provision/<slug>, created
# right before the run and deleted right after it (like work-demo-loader/<org>), never from this
# repository or a run-task override. Run with db_admin_group, after school-migrate, once per school.

variable "school_provision" {
  description = "The school the run-only school-provision task creates (munaxa-school docs/ops/new-school.md): its slug and display name, not secret. Null defines no task."
  type = object({
    slug = string
    name = string
  })
  default = null

  validation {
    condition     = var.school_provision == null || can(regex("^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$", var.school_provision.slug))
    error_message = "school_provision.slug is lowercase letters, digits and -, at most 64 (School's own rule)."
  }

  validation {
    condition     = var.school_provision == null || (length(trimspace(var.school_provision.name)) > 0 && length(var.school_provision.name) <= 200)
    error_message = "school_provision.name is 1 to 200 characters."
  }
}

locals {
  school_provision_defined = var.school_provision != null && local.defined.school_api
  school_provision_secret  = var.school_provision == null ? "" : "${local.prefix}/school-provision/${var.school_provision.slug}"
}

resource "aws_iam_role" "school_provision_execution" {
  count = local.school_provision_defined ? 1 : 0

  name                 = "${local.prefix}-school-provision-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "school_provision_execution" {
  count = local.school_provision_defined ? 1 : 0

  name = "execution"
  role = aws_iam_role.school_provision_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrSignIn", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid      = "PullSchoolApi"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-school/api"
      },
      {
        Sid    = "ReadAppUrlAndOneRunSecret"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["school-api"].arn,
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.school_provision_secret}-??????",
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

resource "aws_ecs_task_definition" "school_provision" {
  count = local.school_provision_defined ? 1 : 0

  family                   = "${local.prefix}-school-provision"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.school_provision_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "school-provision"
    image                  = var.images.school_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    # The runtime image's working directory is /app; Prisma reads DATABASE_URL.
    command = ["node", "dist/ops/provision-school.js"]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "SCHOOL_SLUG", value = var.school_provision.slug },
      { name = "SCHOOL_NAME", value = var.school_provision.name },
      { name = "APPLY", value = "yes" },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.service["school-api"].arn}:DATABASE_URL::${lookup(var.secret_version_ids, "school-api", "")}" },
      { name = "ADMIN_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.school_provision_secret}:ADMIN_EMAIL::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "school-provision"
      }
    }
  }])
}
