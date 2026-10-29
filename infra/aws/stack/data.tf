# The environment's data layer: one KMS key for data at rest, one PostgreSQL 16 instance shared
# by Identity, Control, Work and School (shared AWS hosting ADR §1), and one secret bundle per
# service.
#
# **Shared instance, separate everything else.** Each service has its own database, owner role and
# runtime role, created by the db-admin task (ops.tf, docs/runbooks in README.md) as the RDS master
# user. A service's runtime role cannot connect to another service's database
# (`REVOKE CONNECT ... FROM PUBLIC`), and each service's credentials are only in its own bundle,
# which only its execution role can read.
#
# **No values in Terraform.** The bundles are containers. Values are written by the operator from
# the console or CloudShell as new secret versions, then pinned with secret_version_ids. The RDS
# master password is managed by RDS in Secrets Manager and read by the db-admin task only.

resource "aws_kms_key" "data" {
  description             = "${local.prefix} data at rest: RDS, Secrets Manager bundles, logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministration"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/munaxa/${var.environment}/*" }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.prefix}-data"
  target_key_id = aws_kms_key.data.key_id
}

# --- PostgreSQL ----------------------------------------------------------------------------------

resource "aws_security_group" "database" {
  name        = "${local.prefix}-database"
  description = "Shared PostgreSQL: admits each service's tasks and the db-admin task on 5432, nothing else"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.prefix}-database" }
}

resource "aws_db_subnet_group" "main" {
  name       = local.prefix
  subnet_ids = [for s in aws_subnet.db : s.id]
}

resource "aws_db_parameter_group" "main" {
  name   = "${local.prefix}-pg16"
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "main" {
  identifier     = "${local.prefix}-pg"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.database_instance_class

  allocated_storage = var.database_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.data.arn

  db_name                       = "postgres"
  username                      = "munaxa_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.data.arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = var.database_backup_retention_days
  backup_window              = "01:00-02:00"
  maintenance_window         = "sun:02:30-sun:03:30"
  copy_tags_to_snapshot      = true
  deletion_protection        = var.database_deletion_protection
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.prefix}-pg-final"
  auto_minor_version_upgrade = true
  apply_immediately          = false

  performance_insights_enabled = false

  # Testing stops the instance between sessions (session workflow); a stopped instance is not drift.
  lifecycle {
    ignore_changes = [engine_version]
  }
}

# --- Secret bundles ------------------------------------------------------------------------------
#
# | Bundle                         | Keys (JSON)                                                        |
# | ------------------------------ | ------------------------------------------------------------------ |
# One bundle per service and one per migration job, so a running API never holds the credentials
# of its database's owner role. The db-admin task reads the URLs (not the other keys) to create the
# roles with those passwords.
#
# | Bundle                   | Keys (JSON)                                                         |
# | ------------------------ | ------------------------------------------------------------------- |
# | <env>/identity           | DATABASE_URL, IDENTITY_SIGNING_PRIVATE_KEY, IDENTITY_SIGNING_SECRET, |
# |                          | REDIS_URL, REDIS_PASSWORD                                           |
# | <env>/control-api        | DATABASE_URL                                                        |
# | <env>/work-api           | DATABASE_URL, PII_MATCH_SECRET, CONTROL_PLANE_TOKEN                 |
# | <env>/school-api         | DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,                |
# |                          | CONTROL_PLANE_TOKEN, RESEND_API_KEY                                 |
# | <env>/<product>-migrate  | DATABASE_MIGRATION_URL (the owner role)                             |

locals {
  secret_keys = {
    identity         = ["DATABASE_URL", "IDENTITY_SIGNING_PRIVATE_KEY", "IDENTITY_SIGNING_SECRET", "REDIS_URL", "REDIS_PASSWORD"]
    control-api      = ["DATABASE_URL"]
    identity-migrate = ["DATABASE_MIGRATION_URL"]
    control-migrate  = ["DATABASE_MIGRATION_URL"]
    work-migrate     = ["DATABASE_MIGRATION_URL"]
    school-migrate   = ["DATABASE_MIGRATION_URL"]
    work-api         = ["DATABASE_URL", "PII_MATCH_SECRET", "CONTROL_PLANE_TOKEN"]
    school-api       = ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CONTROL_PLANE_TOKEN", "RESEND_API_KEY"]
  }
}

resource "aws_secretsmanager_secret" "service" {
  for_each = local.secret_keys

  name                    = "${local.prefix}/${each.key}"
  description             = "${each.key} bundle; keys listed in infra/aws/stack/data.tf. Values are written by the operator, never by Terraform"
  kms_key_id              = aws_kms_key.data.arn
  recovery_window_in_days = 30
}
