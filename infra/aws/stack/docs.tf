# Munaxa Docs in the shared environment (owner decision, 30 Oct 2026: recreate Docs in the new
# architecture; the Docs Production stack in munaxa-docs/infra/terraform stays untouched until its
# retirement is approved). The shape follows Docs Production (its eu-prod/service) and the Docs
# readiness report:
#
# | Task           | Size           | Reached by                    | Reads                                  |
# | -------------- | -------------- | ----------------------------- | -------------------------------------- |
# | docs-web       | 0.25 vCPU, 1 GB| ALB (docs host, everything)   | nothing                                |
# | docs-api       | 0.5 vCPU, 2 GB | ALB (preview streams), web    | docs-api bundle; S3 bucket (task role) |
# |                |  + Redis sidecar on 127.0.0.1:6379                                              |
# | docs-scanner   | 0.25 vCPU, 2 GB| docs-api (ICAP, Cloud Map)    | nothing                                |
# | docs-db-admin  | run-only       | -                             | RDS master, docs-operator bundle       |
# | docs-provision | run-only       | -                             | docs-api bundle, docs-provision/<slug> |
#
# Docs keeps its own sign-in (Identity has no OIDC, ADR-0004) and a database per tenant (Docs
# ADR-0015), so its database bootstrap is its own task, not db-bootstrap.sh. Everything here exists
# only when hosts.docs is set; the services also need every Docs image and the Redis image, and
# follow services_enabled and edge_enabled like every other service (Testing sessions only).

locals {
  docs_enabled = var.hosts.docs != null
  docs_defined = local.docs_enabled && alltrue([
    for v in [var.images.docs_api, var.images.docs_web, var.images.docs_antivirus, var.docs_redis_image] : v != ""
  ])

  docs_origin      = local.docs_enabled ? "https://${var.hosts.docs}" : ""
  docs_bucket      = local.docs_enabled ? aws_s3_bucket.files["docs"] : null
  docs_api_dns     = "docs-api.${aws_service_discovery_private_dns_namespace.main.name}"
  docs_scanner_dns = "docs-scanner.${aws_service_discovery_private_dns_namespace.main.name}"
  docs_trust_proxy = join(",", [for s in aws_subnet.public : s.cidr_block])

  docs_app_keys = [
    "DATABASE_URL", "TENANT_CATALOGUE", "REDIS_URL", "REDIS_PASSWORD", "JWT_ACCESS_SECRET",
    "SIGNATURE_WITNESS_SECRET", "AUDIT_CHECKPOINT_SECRET", "MFA_TOTP_SEALING_KEY",
    "METRICS_SCRAPE_TOKEN", "MAIL_RESEND_API_KEY", "CONTROL_PLANE_TOKEN",
  ]
  docs_operator_keys  = ["EDMS_OWNER_PASSWORD", "EDMS_APP_PASSWORD", "EDMS_BACKUP_PASSWORD"]
  docs_provision_keys = ["TENANT_ID", "ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"]

  docs_secret_ref = {
    for key in local.docs_app_keys : key => local.docs_enabled ? "${aws_secretsmanager_secret.service["docs-api"].arn}:${key}::${lookup(var.secret_version_ids, "docs-api", "")}" : ""
  }

  # The API refuses every Control lookup whose host is not allow-listed, without failing at boot,
  # so the Control host is always derived from the URL and listed first (as Docs Production).
  docs_outbound_http_allowlist = join(",", distinct(compact(concat([var.hosts.control_api], var.docs_outbound_http_allowlist_extra))))

  docs_api_environment = {
    NODE_ENV                   = "production"
    PORT                       = "3001"
    NODE_OPTIONS               = "--max-old-space-size=1280"
    LOG_LEVEL                  = "info"
    DEPLOYMENT_PROFILE         = "CLOUD"
    DATABASE_POOL_SIZE         = "5"
    QUEUE_CONSUMERS_ENABLED    = "true"
    CORS_ORIGINS               = local.docs_origin
    WEB_BASE_URL               = local.docs_origin
    TRUST_PROXY                = local.docs_trust_proxy
    STORAGE_DRIVER             = "S3"
    STORAGE_BUCKET             = local.docs_enabled ? local.docs_bucket.bucket : ""
    STORAGE_REGION             = var.region
    STORAGE_CREDENTIALS_SOURCE = "ECS_TASK_ROLE"
    STORAGE_PUBLIC_URL         = local.docs_origin
    MAIL_DRIVER                = "RESEND"
    MAIL_FROM_ADDRESS          = var.docs_mail_from_address
    AV_DRIVER                  = "ICAP"
    AV_ICAP_URL                = "icap://${local.docs_scanner_dns}:1344/avscan"
    OPENAPI_ENABLED            = "false"
    METRICS_DRIVER             = "PROMETHEUS"
    # Production Docs refuses NONE; Control is the licence source (docs#163, docs#165).
    LICENSING_MODE          = "CONTROL_PLANE"
    CONTROL_PLANE_URL       = local.https.control_api
    OUTBOUND_HTTP_ALLOWLIST = local.docs_outbound_http_allowlist
  }

  # Redis reads its password from the environment and writes it to a config file with a shell
  # built-in, so it never appears in a process argument list (as Docs Production).
  docs_redis_command = join(" && ", [
    "umask 077",
    "printf 'requirepass %s\\n' \"$REDIS_PASSWORD\" > /tmp/redis.conf",
    "exec redis-server /tmp/redis.conf --bind 127.0.0.1 --port 6379 --protected-mode yes --maxmemory 192mb --maxmemory-policy noeviction --save '' --appendonly no",
  ])

  docs_redis_container = {
    name                   = "redis"
    image                  = var.docs_redis_image
    essential              = true
    memory                 = 256
    user                   = "999:999"
    readonlyRootFilesystem = false # writes its password file to /tmp
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    entryPoint             = ["sh", "-c"]
    command                = [local.docs_redis_command]
    secrets                = [{ name = "REDIS_PASSWORD", valueFrom = local.docs_secret_ref["REDIS_PASSWORD"] }]
    healthCheck = {
      command     = ["CMD-SHELL", "REDISCLI_AUTH=\"$REDIS_PASSWORD\" redis-cli -h 127.0.0.1 ping | grep -q PONG"]
      interval    = 10
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }
}

# --- Services ----------------------------------------------------------------------------------

module "docs_api" {
  source = "../modules/service"
  count  = local.docs_defined ? 1 : 0

  prefix                     = local.common.prefix
  region                     = local.common.region
  account_id                 = var.account_id
  cluster_arn                = local.common.cluster_arn
  vpc_id                     = local.common.vpc_id
  subnet_ids                 = local.common.subnet_ids
  alb_security_group_id      = local.common.alb_security_group_id
  database_security_group_id = local.common.database_security_group_id
  secrets_kms_key_arn        = local.common.secrets_kms_key_arn
  log_retention_days         = local.common.log_retention_days

  name   = "docs-api"
  image  = var.images.docs_api
  cpu    = 512
  memory = 2048
  port   = 3001

  environment       = local.docs_api_environment
  secret_arn        = aws_secretsmanager_secret.service["docs-api"].arn
  secret_keys       = [for k in local.docs_app_keys : k if k != "REDIS_PASSWORD"]
  secret_version_id = lookup(var.secret_version_ids, "docs-api", "")

  sidecars = [merge(local.docs_redis_container, {
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/munaxa/${var.environment}/docs-api"
        awslogs-region        = var.region
        awslogs-stream-prefix = "redis"
      }
    }
  })]
  depends_on_sidecars  = ["redis"]
  health_check_command = ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

  # The document bucket only (the S3 adapter: GET, HEAD, PUT, DELETE, multipart abort, listing).
  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DocumentObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
        Resource = ["${local.docs_bucket.arn}/*"]
      },
      {
        Sid      = "DocumentBucketListing"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [local.docs_bucket.arn]
      },
    ]
  })

  create_service    = local.running
  desired_count     = lookup(var.desired_counts, "docs-api", 1)
  connect_database  = true
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/api/health/live"
  # Only the preview stream is public on the API; every other request goes to web (Docs edge.tf).
  routes = [{ priority = 70, hosts = [var.hosts.docs], paths = ["/api/v1/preview/stream*"] }]

  discovery_namespace_id     = aws_service_discovery_private_dns_namespace.main.id
  register_discovery         = true
  ingress_security_group_ids = { docs-web = module.docs_web[0].security_group_id }
  egress_to                  = { docs-scanner = { port = 1344, security_group_id = module.docs_scanner[0].security_group_id } }
}

module "docs_web" {
  source = "../modules/service"
  count  = local.docs_defined ? 1 : 0

  prefix                = local.common.prefix
  region                = local.common.region
  account_id            = var.account_id
  cluster_arn           = local.common.cluster_arn
  vpc_id                = local.common.vpc_id
  subnet_ids            = local.common.subnet_ids
  alb_security_group_id = local.common.alb_security_group_id
  log_retention_days    = local.common.log_retention_days

  name   = "docs-web"
  image  = var.images.docs_web
  cpu    = 256
  memory = 1024
  port   = 3000

  environment = {
    NODE_ENV            = "production"
    PORT                = "3000"
    NEXT_PUBLIC_API_URL = "http://${local.docs_api_dns}:3001"
    WEB_TRUST_PROXY     = local.docs_trust_proxy
  }

  create_service    = local.running
  desired_count     = lookup(var.desired_counts, "docs-web", 1)
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/login"
  routes            = [{ priority = 71, hosts = [var.hosts.docs] }]
  egress_to         = { docs-api = { port = 3001, security_group_id = module.docs_api[0].security_group_id } }
}

module "docs_scanner" {
  source = "../modules/service"
  count  = local.docs_defined ? 1 : 0

  prefix             = local.common.prefix
  region             = local.common.region
  account_id         = var.account_id
  cluster_arn        = local.common.cluster_arn
  vpc_id             = local.common.vpc_id
  subnet_ids         = local.common.subnet_ids
  log_retention_days = local.common.log_retention_days

  name   = "docs-scanner"
  image  = var.images.docs_antivirus
  cpu    = 256
  memory = 2048
  port   = 1344
  # Writes signatures, pid files and scan files under /var and /tmp (Docs ecs.tf). Its 443 egress
  # (the module default) reaches ECR, the ClamAV signature mirrors and CloudWatch Logs.
  readonly_root_filesystem = false

  # A real scan through c-icap and clamd; the start period covers the first signature download.
  health_check_command      = ["CMD-SHELL", "c-icap-client -i 127.0.0.1 -p 1344 -s avscan -f /etc/hostname -resp http://probe/ -v 2>&1 | grep -q 'ICAP/1.0 204'"]
  health_check_start_period = 300

  create_service             = local.running
  desired_count              = lookup(var.desired_counts, "docs-scanner", 1)
  discovery_namespace_id     = aws_service_discovery_private_dns_namespace.main.id
  register_discovery         = true
  ingress_security_group_ids = { docs-api = module.docs_api[0].security_group_id }
}

# --- Database bootstrap (run-only) -------------------------------------------------------------
#
# As the RDS master user: the cluster roles (Docs infra/sql/cluster/01-roles.sql, vendored in
# scripts/), their passwords from the docs-operator bundle, edms_backup, and the tenant database
# owned by edms_owner. Idempotent. Passwords reach psql through \getenv only. The per-database
# grants, migrations and post-migrate SQL are docs-provision's job (Docs ops-provision).

locals {
  docs_dbadmin_sql = join("\n", [
    "\\set ON_ERROR_STOP on",
    "DO $$ BEGIN SET log_min_error_statement TO panic; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'log_min_error_statement unchanged'; END $$;",
    file("${path.module}/scripts/docs-cluster-roles.sql"),
    "\\getenv owner_pw EDMS_OWNER_PASSWORD",
    "\\getenv app_pw EDMS_APP_PASSWORD",
    "\\getenv backup_pw EDMS_BACKUP_PASSWORD",
    "\\getenv tenant_db TENANT_DATABASE",
    "ALTER ROLE edms_owner PASSWORD :'owner_pw';",
    "ALTER ROLE edms_app PASSWORD :'app_pw';",
    "SELECT 'CREATE ROLE edms_backup LOGIN BYPASSRLS' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_backup') \\gexec",
    "ALTER ROLE edms_backup PASSWORD :'backup_pw';",
    "GRANT pg_read_all_data TO edms_backup;",
    "-- PostgreSQL 16: the master needs SET on edms_owner before CREATE DATABASE ... OWNER.",
    "GRANT edms_owner TO CURRENT_USER WITH SET TRUE;",
    "SELECT format('CREATE DATABASE %I OWNER edms_owner', :'tenant_db') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'tenant_db') \\gexec",
    "-- Like db-bootstrap.sh: no other role may connect to the tenant database.",
    "SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'tenant_db') \\gexec",
    "SELECT format('GRANT CONNECT ON DATABASE %I TO edms_owner, edms_app, edms_backup', :'tenant_db') \\gexec",
    "-- edms_backup bypasses RLS on a shared instance, so it may connect to Docs databases only. Each",
    "-- product database already refuses PUBLIC (db-bootstrap.sh); postgres and template1 hold no data.",
    "-- Stop if anything else is open to it (reviewer R-14).",
    "DO $$ DECLARE open_dbs text; BEGIN SELECT string_agg(datname, ', ') INTO open_dbs FROM pg_database WHERE datallowconn AND datname NOT LIKE 'edms\\_%' AND datname NOT IN ('postgres', 'template1', 'rdsadmin') AND has_database_privilege('edms_backup', datname, 'CONNECT'); IF open_dbs IS NOT NULL THEN RAISE EXCEPTION 'edms_backup can connect to non-Docs databases: %', open_dbs; END IF; END $$;",
    "SELECT rolname, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname LIKE 'edms_%' ORDER BY rolname;",
    "SELECT datname, pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = :'tenant_db';",
  ])
}

resource "aws_iam_role" "docs_db_admin_execution" {
  count = local.docs_enabled ? 1 : 0

  name                 = "${local.prefix}-docs-db-admin-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "docs_db_admin_execution" {
  count = local.docs_enabled ? 1 : 0

  name = "execution"
  role = aws_iam_role.docs_db_admin_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadMasterAndDocsOperator"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = [aws_db_instance.main.master_user_secret[0].secret_arn, aws_secretsmanager_secret.service["docs-operator"].arn]
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

resource "aws_ecs_task_definition" "docs_db_admin" {
  count = local.docs_enabled && var.postgres_image != "" ? 1 : 0

  family                   = "${local.prefix}-docs-db-admin"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.docs_db_admin_execution[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "docs-db-admin"
    image                  = var.postgres_image
    essential              = true
    user                   = "999:999"
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    entryPoint             = ["sh", "-c"]
    command                = ["printf '%s\\n' \"$DBADMIN_SQL\" | psql -X -q"]
    environment = [for k, v in {
      PGHOST          = aws_db_instance.main.address
      PGPORT          = tostring(aws_db_instance.main.port)
      PGDATABASE      = "postgres"
      PGSSLMODE       = "require"
      PGAPPNAME       = "munaxa-docs-db-admin"
      HOME            = "/tmp"
      TENANT_DATABASE = var.docs_tenant.database
      DBADMIN_SQL     = local.docs_dbadmin_sql
    } : { name = k, value = v }]
    secrets = concat(
      [
        { name = "PGUSER", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
      ],
      [for k in local.docs_operator_keys : { name = k, valueFrom = "${aws_secretsmanager_secret.service["docs-operator"].arn}:${k}::${lookup(var.secret_version_ids, "docs-operator", "")}" }],
    )
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "docs-db-admin"
      }
    }
  }])
}

# --- Tenant provisioning (run-only) ------------------------------------------------------------
#
# The API image running provision.js for the one tenant (Docs ops-provision): single-tenant
# profile, queue consumers off, the API's task role (the bucket). Its temporary secret
# munaxa-<env>/docs-provision/<slug> is created by the owner for one run and deleted afterwards;
# its random suffix is unknown, so it is read by name. Run it with the docs-api security group.

resource "aws_iam_role" "docs_provision_execution" {
  count = local.docs_defined ? 1 : 0

  name                 = "${local.prefix}-docs-provision-execution"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy   = aws_iam_role.db_admin_execution.assume_role_policy
}

resource "aws_iam_role_policy" "docs_provision_execution" {
  count = local.docs_defined ? 1 : 0

  name = "execution"
  role = aws_iam_role.docs_provision_execution[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrSignIn", Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Sid      = "PullDocsApi"
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:${var.region}:${var.account_id}:repository/munaxa-docs/api"
      },
      {
        Sid    = "ReadAppAndProvisionSecrets"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          aws_secretsmanager_secret.service["docs-api"].arn,
          "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/docs-provision/${var.docs_tenant.slug}-??????",
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

resource "aws_ecs_task_definition" "docs_provision" {
  count = local.docs_defined ? 1 : 0

  family                   = "${local.prefix}-docs-provision"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 2048
  execution_role_arn       = aws_iam_role.docs_provision_execution[0].arn
  task_role_arn            = module.docs_api[0].task_role_arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name                   = "provision"
      image                  = var.images.docs_api
      essential              = true
      memory                 = 1792
      readonlyRootFilesystem = true
      linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
      command                = ["node", "apps/api/dist/provision.js"]
      environment = [for k, v in merge(local.docs_api_environment, {
        DEPLOYMENT_PROFILE      = "ON_PREMISE"
        QUEUE_CONSUMERS_ENABLED = "false"
        TENANT_SLUG             = var.docs_tenant.slug
        TENANT_NAME             = var.docs_tenant.name
      }) : { name = k, value = v }]
      secrets = concat(
        [for k in local.docs_app_keys : { name = k, valueFrom = local.docs_secret_ref[k] } if !contains(["REDIS_PASSWORD", "TENANT_CATALOGUE"], k)],
        [for k in local.docs_provision_keys : { name = k, valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/docs-provision/${var.docs_tenant.slug}:${k}::" }],
      )
      dependsOn = [{ containerName = "redis", condition = "HEALTHY" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ops.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "docs-provision"
        }
      }
    },
    merge(local.docs_redis_container, {
      essential = false
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ops.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "docs-provision-redis"
        }
      }
    }),
  ])
}
