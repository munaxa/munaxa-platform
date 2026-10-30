# The services of the shared environment, in the order they must come up:
#
#   Identity ──► Control (API, then portal) ──► Work, School, Docs (docs.tf)
#
# Identity issues the tokens Work and Control verify; Control is the licence source for Work,
# School and Docs. Products reach both over HTTPS by their public names, as an on-premises
# installation would, never by a private shortcut (shared AWS hosting ADR §2).
#
# A service exists only when its image digest is set; it runs only when services_enabled. With
# edge_enabled off (Testing between sessions) the task definitions stay registered and nothing runs.

locals {
  https = { for k, v in var.hosts : k => "https://${v}" if v != null }
  # A service is defined when its image is set, and running when services are enabled.
  defined  = { for k, v in var.images : k => v != "" }
  running  = var.services_enabled
  routed   = var.edge_enabled
  listener = var.edge_enabled ? aws_lb_listener.https[0].arn : null

  # The operator host is open only when something stands in front of it: Cloudflare Access, whose
  # token Control verifies, or operator source ranges. Otherwise rule 39 refuses every request.
  operator_open = var.operator_access != null || length(var.operator_cidrs) > 0
  operator_access_environment = var.operator_access == null ? {} : {
    OPERATOR_ACCESS_TEAM_DOMAIN = var.operator_access.team_domain
    OPERATOR_ACCESS_AUDIENCE    = var.operator_access.audience
  }

  common = {
    prefix                     = local.prefix
    region                     = var.region
    cluster_arn                = aws_ecs_cluster.main.arn
    vpc_id                     = aws_vpc.main.id
    subnet_ids                 = [for s in aws_subnet.public : s.id]
    alb_security_group_id      = aws_security_group.alb.id
    database_security_group_id = aws_security_group.database.id
    secrets_kms_key_arn        = aws_kms_key.data.arn
    log_retention_days         = var.log_retention_days
  }

  # The ALB's egress, one rule per routed task group and port.
  routed_ports = merge(
    local.defined.identity_api ? { identity = { port = 4001, security_group_id = module.identity[0].security_group_id } } : {},
    local.defined.control_api ? { control-api = { port = 3100, security_group_id = module.control_api[0].security_group_id } } : {},
    local.defined.control_portal ? { control-portal = { port = 3200, security_group_id = module.control_portal[0].security_group_id } } : {},
    local.defined.work_api ? { work-api = { port = 3000, security_group_id = module.work_api[0].security_group_id } } : {},
    local.defined.work_admin ? { work-admin = { port = 3001, security_group_id = module.work_admin[0].security_group_id } } : {},
    local.defined.school_api ? { school-api = { port = 4000, security_group_id = module.school_api[0].security_group_id } } : {},
    local.defined.school_admin ? { school-admin = { port = 3000, security_group_id = module.school_admin[0].security_group_id } } : {},
    local.docs_defined ? { docs-api = { port = 3001, security_group_id = module.docs_api[0].security_group_id } } : {},
    local.docs_defined ? { docs-web = { port = 3000, security_group_id = module.docs_web[0].security_group_id } } : {},
  )

  node_health = { for name, url in {
    identity    = "http://127.0.0.1:4001/api/auth/health/live"
    control-api = "http://127.0.0.1:3100/health/live"
    work-api    = "http://127.0.0.1:3000/health/live"
    school-api  = "http://127.0.0.1:4000/api/v1/health/live"
  } : name => ["CMD", "node", "-e", "fetch('${url}').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"] }
}

resource "aws_ecs_cluster" "main" {
  name = local.prefix

  setting {
    name  = "containerInsights"
    value = "disabled" # not deployed until approved (ADR §5)
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# Private names for server-to-server calls that must not be public: the Control portal to the
# Control admin API, and the Work admin to the Work API. A Route 53 private zone, US$0.50 a month.
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.environment}.munaxa.internal"
  description = "Munaxa ${var.environment} private service names"
  vpc         = aws_vpc.main.id
}

# --- Identity ----------------------------------------------------------------------------------

module "identity" {
  source = "../modules/service"
  count  = local.defined.identity_api ? 1 : 0

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

  name   = "identity"
  image  = var.images.identity_api
  cpu    = 512
  memory = 1024
  port   = 4001

  environment = {
    NODE_ENV                      = "production"
    PORT                          = "4001"
    IDENTITY_BASE_URL             = local.https.identity
    IDENTITY_AUTH_AUDIENCE        = "munaxa-work,munaxa-control"
    IDENTITY_SIGNING_ALGORITHM    = "ES256"
    IDENTITY_SIGNING_KID          = var.identity_signing_kid
    IDENTITY_DEFAULT_ORGANISATION = var.identity_default_organisation
    # Every origin a browser posts to /api/auth/* from: Identity's own, Work's and the operator's.
    CSRF_TRUSTED_ORIGINS = join(",", [local.https.identity, local.https.work, local.https.operator])
    LOG_PRETTY           = "false"
    # The ALB is the one proxy in front of Identity; without it every client shares the ALB's
    # address and so one per-IP login limiter (identity#2).
    TRUST_PROXY_HOPS = "1"
  }
  secret_arn        = aws_secretsmanager_secret.service["identity"].arn
  secret_keys       = local.secret_keys["identity"]
  secret_version_id = lookup(var.secret_version_ids, "identity", "")

  # Identity's lockout counters and rate limits live in Redis (its ADR-0002). Testing and the first
  # Production run a Valkey sidecar on 127.0.0.1, password-protected, no persistence: a restart
  # resets counters, which ADR §1 accepts until ElastiCache is justified.
  sidecars = var.valkey_image == "" ? [] : [{
    name                   = "valkey"
    image                  = var.valkey_image
    essential              = true
    user                   = "999:999"
    readonlyRootFilesystem = false # writes its config file to /tmp
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    entryPoint             = ["sh", "-c"]
    command = [join(" && ", [
      "umask 077",
      "printf 'requirepass %s\\n' \"$REDIS_PASSWORD\" > /tmp/valkey.conf",
      "exec valkey-server /tmp/valkey.conf --bind 127.0.0.1 --port 6379 --protected-mode yes --maxmemory 128mb --maxmemory-policy noeviction --save '' --appendonly no",
    ])]
    secrets = [{
      name      = "REDIS_PASSWORD"
      valueFrom = "${aws_secretsmanager_secret.service["identity"].arn}:REDIS_PASSWORD::${lookup(var.secret_version_ids, "identity", "")}"
    }]
    healthCheck = {
      command     = ["CMD-SHELL", "valkey-cli -a \"$REDIS_PASSWORD\" --no-auth-warning ping | grep -q PONG"]
      interval    = 10
      timeout     = 3
      retries     = 5
      startPeriod = 10
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/munaxa/${var.environment}/identity"
        awslogs-region        = var.region
        awslogs-stream-prefix = "valkey"
      }
    }
  }]
  depends_on_sidecars  = var.valkey_image == "" ? [] : ["valkey"]
  health_check_command = local.node_health["identity"]

  create_service    = local.running
  desired_count     = var.desired_counts["identity"]
  connect_database  = true
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/api/auth/health/ready"
  routes = concat(
    local.operator_open ? [{ priority = 30, hosts = [var.hosts.operator], paths = ["/api/auth/*"], source_ips = var.operator_cidrs }] : [],
    [
      { priority = 40, hosts = [var.hosts.identity] },
      { priority = 50, hosts = [var.hosts.work], paths = ["/api/auth/*"] },
    ],
  )
}

# --- Control -----------------------------------------------------------------------------------
#
# The licence signing key is an asymmetric KMS key the API may only sign with (Control ADR-0008,
# proposed). If that ADR is declined, replace this with the init-container volume of ADR-0003.

# The key policy names only the account; the Control API task role's own policy grants kms:Sign on
# this key and nothing else (a key policy cannot name a role that does not exist yet, and the role
# is created with the service).
resource "aws_kms_key" "licence" {
  count = local.defined.control_api ? 1 : 0

  description              = "${local.prefix} Munaxa Control licence signing key (ADR-0008); the private half never leaves KMS"
  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30

  # Every licence Control has issued verifies against this key. Removing the Control image from
  # tfvars would otherwise schedule it for deletion; now the plan fails instead. Retiring it is a
  # reviewed change that removes this line first.
  lifecycle {
    prevent_destroy = true
  }
}

# Least privilege (ADR-0008): the account administers the key but cannot sign with it; only the
# control-api task role signs, and only ES256 digests. A separate resource, because the task
# role's own policy names the key. The account keeps kms:PutKeyPolicy, so the key stays
# recoverable; no grant can hand signing to anyone else.
resource "aws_kms_key_policy" "licence" {
  count = local.defined.control_api ? 1 : 0

  key_id = aws_kms_key.licence[0].id
  policy = jsonencode(local.licence_policy)
}

locals {
  licence_policy = !local.defined.control_api ? null : {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministersNotSigns"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
        Action = [
          "kms:DescribeKey",
          "kms:GetKeyPolicy",
          "kms:PutKeyPolicy",
          "kms:ListKeyPolicies",
          "kms:GetPublicKey",
          "kms:ListGrants",
          "kms:RevokeGrant",
          "kms:ListResourceTags",
          "kms:TagResource",
          "kms:UntagResource",
          "kms:CreateAlias",
          "kms:UpdateAlias",
          "kms:DeleteAlias",
          "kms:UpdateKeyDescription",
          "kms:EnableKey",
          "kms:DisableKey",
          "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion",
        ]
        Resource = "*"
      },
      {
        Sid       = "ControlApiSignsLicences"
        Effect    = "Allow"
        Principal = { AWS = module.control_api[0].task_role_arn }
        Action    = "kms:Sign"
        Resource  = "*"
        Condition = {
          StringEquals = {
            "kms:SigningAlgorithm" = "ECDSA_SHA_256"
            "kms:MessageType"      = "DIGEST"
          }
        }
      },
      {
        Sid       = "NoOtherSigner"
        Effect    = "Deny"
        Principal = { AWS = "*" }
        Action    = "kms:Sign"
        Resource  = "*"
        Condition = { ArnNotEquals = { "aws:PrincipalArn" = module.control_api[0].task_role_arn } }
      },
      {
        Sid       = "NoGrants"
        Effect    = "Deny"
        Principal = { AWS = "*" }
        Action    = "kms:CreateGrant"
        Resource  = "*"
      },
    ]
  }
}

resource "aws_kms_alias" "licence" {
  count = local.defined.control_api ? 1 : 0

  name          = "alias/${local.prefix}-control-licence"
  target_key_id = aws_kms_key.licence[0].key_id
}

module "control_api" {
  source = "../modules/service"
  count  = local.defined.control_api ? 1 : 0

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

  name   = "control-api"
  image  = var.images.control_api
  cpu    = 256
  memory = 512
  port   = 3100

  environment = merge(local.operator_access_environment, {
    NODE_ENV                   = "production"
    PORT                       = "3100"
    OPERATOR_AUTH_ISSUER       = local.https.identity
    OPERATOR_AUTH_AUDIENCE     = "munaxa-control"
    OPERATOR_AUTH_PUBLIC_KEYS  = var.identity_public_keys
    OPERATOR_ORGANISATION_ID   = var.control_operator_organisation_id
    OPERATOR_REQUIRE_MFA       = "false" # Identity issues no mfa claim yet (Identity ADR-0003)
    OPERATOR_SUBJECT_ALLOWLIST = join(",", var.control_operator_subjects)
    LICENCE_SIGNING_BACKEND    = "KMS"
    LICENCE_SIGNING_KMS_KEY_ID = aws_kms_key.licence[0].arn
    LICENCE_SIGNING_PUBLIC_KEY = var.control_licence_public_key
    LICENCE_SIGNING_KID        = var.control_licence_kid
    LICENCE_SIGNING_ALGORITHM  = "ES256"
    TRUST_PROXY_HOPS           = "1" # the ALB
  })
  secret_arn        = aws_secretsmanager_secret.service["control-api"].arn
  secret_keys       = local.secret_keys["control-api"]
  secret_version_id = lookup(var.secret_version_ids, "control-api", "")

  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SignLicences"
      Effect   = "Allow"
      Action   = ["kms:Sign"]
      Resource = [aws_kms_key.licence[0].arn]
      Condition = {
        StringEquals = {
          "kms:SigningAlgorithm" = "ECDSA_SHA_256"
          "kms:MessageType"      = "DIGEST"
        }
      }
    }]
  })

  health_check_command = local.node_health["control-api"]
  create_service       = local.running
  desired_count        = var.desired_counts["control-api"]
  connect_database     = true
  routed               = local.routed
  listener_arn         = local.listener
  health_check_path    = "/health/ready"
  # Only Control's product-facing surface is public. ALB path patterns match case-sensitively and
  # Express routes do not, so a deny on /api/v1/admin/* alone would let /API/v1/Admin/* through:
  # the public host forwards these prefixes and rule 21 refuses everything else.
  routes = [{
    priority = 20
    hosts    = [var.hosts.control_api]
    paths    = ["/api/v1/products/*", "/api/v1/licensing/*", "/health/*"]
  }]

  discovery_namespace_id     = aws_service_discovery_private_dns_namespace.main.id
  register_discovery         = true
  ingress_security_group_ids = local.defined.control_portal ? { control-portal = module.control_portal[0].security_group_id } : {}
}

# The release job: migrations and runtime grants as control_owner (Control deployment.md). Run once
# per release by the deploy workflow, before the new API version.
module "control_migrate" {
  source = "../modules/service"
  count  = local.defined.control_migrate ? 1 : 0

  prefix                     = local.common.prefix
  region                     = local.common.region
  account_id                 = var.account_id
  cluster_arn                = local.common.cluster_arn
  vpc_id                     = local.common.vpc_id
  subnet_ids                 = local.common.subnet_ids
  database_security_group_id = local.common.database_security_group_id
  secrets_kms_key_arn        = local.common.secrets_kms_key_arn
  log_retention_days         = local.common.log_retention_days

  name                     = "control-migrate"
  image                    = var.images.control_migrate
  readonly_root_filesystem = false
  environment              = { NODE_ENV = "production" }
  secret_arn               = aws_secretsmanager_secret.service["control-migrate"].arn
  secret_keys              = local.secret_keys["control-migrate"]
  secret_version_id        = lookup(var.secret_version_ids, "control-migrate", "")

  create_service   = false
  connect_database = true
}

module "control_portal" {
  source = "../modules/service"
  count  = local.defined.control_portal ? 1 : 0

  prefix                = local.common.prefix
  region                = local.common.region
  account_id            = var.account_id
  cluster_arn           = local.common.cluster_arn
  vpc_id                = local.common.vpc_id
  subnet_ids            = local.common.subnet_ids
  alb_security_group_id = local.common.alb_security_group_id
  log_retention_days    = local.common.log_retention_days

  name                     = "control-portal"
  image                    = var.images.control_portal
  port                     = 3200
  readonly_root_filesystem = false # Next.js writes its cache
  environment = merge(local.operator_access_environment, {
    NODE_ENV        = "production"
    PORT            = "3200"
    HOSTNAME        = "0.0.0.0"
    CONTROL_API_URL = "http://control-api.${aws_service_discovery_private_dns_namespace.main.name}:3100"
  })

  create_service    = local.running
  desired_count     = var.desired_counts["control-portal"]
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/healthz" # every other path answers 401 without an Access token
  routes = local.operator_open ? [
    { priority = 31, hosts = [var.hosts.operator], source_ips = var.operator_cidrs },
  ] : []
  egress_to = local.defined.control_api ? { control-api = { port = 3100, security_group_id = module.control_api[0].security_group_id } } : {}
}

# Control's hourly sweep (deployment.md "The sweep"): the API image with sweep.js. Production
# only; Testing runs it by hand in a session.
resource "aws_scheduler_schedule" "control_sweep" {
  count = local.defined.control_api && var.environment == "prod" && local.running ? 1 : 0

  name                = "${local.prefix}-control-sweep"
  schedule_expression = "rate(1 hour)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.scheduler[0].arn

    ecs_parameters {
      task_definition_arn = module.control_api[0].task_definition_arn
      launch_type         = "FARGATE"
      network_configuration {
        subnets          = local.common.subnet_ids
        security_groups  = [module.control_api[0].security_group_id]
        assign_public_ip = true
      }
    }

    input = jsonencode({
      containerOverrides = [{ name = "control-api", command = ["node", "dist/sweep.js"] }]
    })
  }
}

resource "aws_iam_role" "scheduler" {
  count = local.defined.control_api && var.environment == "prod" && local.running ? 1 : 0

  name                 = "${local.prefix}-scheduler"
  path                 = "/munaxa-shared/"
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  count = local.defined.control_api && var.environment == "prod" && local.running ? 1 : 0

  name = "run-control-sweep"
  role = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "ecs:RunTask"
        Resource  = [replace(module.control_api[0].task_definition_arn, "/:\\d+$/", ":*")]
        Condition = { ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn } }
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = compact([module.control_api[0].execution_role_arn, module.control_api[0].task_role_arn])
      },
    ]
  })
}

# --- Work --------------------------------------------------------------------------------------

module "work_api" {
  source = "../modules/service"
  count  = local.defined.work_api ? 1 : 0

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

  name   = "work-api"
  image  = var.images.work_api
  cpu    = 256
  memory = 512
  port   = 3000

  environment = {
    NODE_ENV = "production"
    # Must equal Identity's IDENTITY_BASE_URL character for character; nothing checks it at boot.
    PLATFORM_AUTH_ISSUER      = local.https.identity
    PLATFORM_AUTH_AUDIENCE    = "munaxa-work"
    PLATFORM_AUTH_ALGORITHM   = "ES256"
    PLATFORM_AUTH_PUBLIC_KEYS = var.identity_public_keys
    # Production refuses NONE (work#24). Control is the licence source for hosted Work.
    LICENSING_MODE    = "CONTROL_PLANE"
    CONTROL_PLANE_URL = local.https.control_api
  }
  secret_arn        = aws_secretsmanager_secret.service["work-api"].arn
  secret_keys       = local.secret_keys["work-api"]
  secret_version_id = lookup(var.secret_version_ids, "work-api", "")

  health_check_command = local.node_health["work-api"]
  create_service       = local.running
  desired_count        = var.desired_counts["work-api"]
  connect_database     = true
  routed               = local.routed
  listener_arn         = local.listener
  health_check_path    = "/health/ready"
  routes               = [{ priority = 51, hosts = [var.hosts.work], paths = ["/api/v1/*"] }]

  discovery_namespace_id     = aws_service_discovery_private_dns_namespace.main.id
  register_discovery         = true
  ingress_security_group_ids = local.defined.work_admin ? { work-admin = module.work_admin[0].security_group_id } : {}
}

module "work_admin" {
  source = "../modules/service"
  count  = local.defined.work_admin ? 1 : 0

  prefix                = local.common.prefix
  region                = local.common.region
  account_id            = var.account_id
  cluster_arn           = local.common.cluster_arn
  vpc_id                = local.common.vpc_id
  subnet_ids            = local.common.subnet_ids
  alb_security_group_id = local.common.alb_security_group_id
  log_retention_days    = local.common.log_retention_days

  name                     = "work-admin"
  image                    = var.images.work_admin
  port                     = 3001
  readonly_root_filesystem = false # Next.js writes its cache
  environment = {
    NODE_ENV             = "production"
    PORT                 = "3001"
    WORK_API_URL         = "http://work-api.${aws_service_discovery_private_dns_namespace.main.name}:3000"
    PLATFORM_SIGN_IN_URL = "${local.https.work}/api/auth/login"
  }

  create_service    = local.running
  desired_count     = var.desired_counts["work-admin"]
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/"
  routes            = [{ priority = 52, hosts = [var.hosts.work] }]
  egress_to         = local.defined.work_api ? { work-api = { port = 3000, security_group_id = module.work_api[0].security_group_id } } : {}
}

# --- School ------------------------------------------------------------------------------------
#
# School still runs its own JWT authentication (no Identity integration yet). Its admin bakes
# NEXT_PUBLIC_API_URL into the image at build time, so each environment has its own admin build
# (publish workflow input), served on the same host as the API so the browser stays same-origin.

module "school_api" {
  source = "../modules/service"
  count  = local.defined.school_api ? 1 : 0

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

  name   = "school-api"
  image  = var.images.school_api
  cpu    = 256
  memory = 512
  port   = 4000

  environment = {
    NODE_ENV            = "production"
    PORT                = "4000"
    API_GLOBAL_PREFIX   = "api"
    API_VERSION         = "v1"
    CORS_ORIGINS        = local.https.school
    JWT_ACCESS_TTL      = "900"
    JWT_REFRESH_TTL     = "2592000"
    EMAIL_SENDER_DOMAIN = "mail.munaxa.com"
    # Production refuses DATABASE licensing (school#18). Control is the licence source.
    LICENSING_MODE    = "CONTROL_PLANE"
    CONTROL_PLANE_URL = local.https.control_api
    # File storage (storage.tf). Credentials come from the task role (school#21); no key is set.
    AWS_S3_BUCKET = local.school_files_bucket.bucket
    AWS_REGION    = var.region
  }
  secret_arn = aws_secretsmanager_secret.service["school-api"].arn

  # Its own tenants' objects only: School writes every object under tenants/<tenantId>/.
  task_role_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "TenantObjects"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = ["${local.school_files_bucket.arn}/tenants/*"]
      },
      {
        Sid      = "BucketListing"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [local.school_files_bucket.arn]
      },
    ]
  })
  secret_keys       = local.secret_keys["school-api"]
  secret_version_id = lookup(var.secret_version_ids, "school-api", "")

  health_check_command = local.node_health["school-api"]
  create_service       = local.running
  desired_count        = var.desired_counts["school-api"]
  connect_database     = true
  routed               = local.routed
  listener_arn         = local.listener
  health_check_path    = "/api/v1/health/ready"
  # /api/v1/* only: the admin serves its own /api/health, and proxies /api/v1/* itself in development.
  routes = [{ priority = 60, hosts = [var.hosts.school], paths = ["/api/v1/*"] }]
}

module "school_admin" {
  source = "../modules/service"
  count  = local.defined.school_admin ? 1 : 0

  prefix                = local.common.prefix
  region                = local.common.region
  account_id            = var.account_id
  cluster_arn           = local.common.cluster_arn
  vpc_id                = local.common.vpc_id
  subnet_ids            = local.common.subnet_ids
  alb_security_group_id = local.common.alb_security_group_id
  log_retention_days    = local.common.log_retention_days

  name                     = "school-admin"
  image                    = var.images.school_admin
  port                     = 3000
  readonly_root_filesystem = false # Next.js writes its cache
  environment = {
    NODE_ENV = "production"
    PORT     = "3000"
    HOSTNAME = "0.0.0.0"
  }

  create_service    = local.running
  desired_count     = var.desired_counts["school-admin"]
  routed            = local.routed
  listener_arn      = local.listener
  health_check_path = "/login"
  routes            = [{ priority = 61, hosts = [var.hosts.school] }]
}
