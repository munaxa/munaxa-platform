# Production Identity's shared security state: Amazon ElastiCache for Valkey, node-based, cluster
# mode disabled. Created only with var.identity_cache (production only, variables.tf); Testing keeps
# its one task with a Valkey sidecar and creates none of this.
#
# Design and evidence: report 2026-11-12-identity-shared-valkey-platform-release, 01 sections 5 to 7;
# implementation report 2026-11-12-phase-a-identity-valkey-implementation.
#
# | Property            | Value                                                                      |
# | ------------------- | -------------------------------------------------------------------------- |
# | Engine              | valkey 8.x, one replication group, cluster mode disabled (standalone       |
# |                     | client, multi-key `clear()` works)                                         |
# | Size                | var.identity_cache.node_type (cache.t4g.micro); replicas 0, or 1 with      |
# |                     | Multi-AZ automatic failover, an in-place change on the same endpoint       |
# | In transit          | TLS required (transit_encryption_mode = "required"): no plaintext client   |
# | At rest             | encrypted with the environment's data key (aws_kms_key.data)               |
# | Authentication      | AUTH token = REDIS_PASSWORD of the <env>/identity bundle version pinned in |
# |                     | secret_version_ids.identity, via an ephemeral read into auth_token_wo:     |
# |                     | never in a variable, plan, state or log                                    |
# | Eviction            | noeviction: a full store refuses writes and Identity fails closed (503);   |
# |                     | an evicting policy would drop lockout, attempt and replay keys (a bypass)  |
# | Network             | the isolated database subnets (local routes only); port 6379 admitted from |
# |                     | the cache-client group only, which only the Identity ECS service carries   |
# | Snapshots           | none: restoring old lockout, replay and permission state is never wanted   |
# | Alarms              | to the ops SNS topic; the subscription is an operator action               |
#
# No variable switches TLS, encryption, authentication or the eviction policy off; the
# postcondition below and the mocked tests (tests/identity-cache.tftest.hcl) hold them.

locals {
  identity_cache = var.identity_cache != null

  # Member cluster ids of the replication group: ElastiCache names them <group>-001, -002, ...
  identity_cache_id      = "${local.prefix}-identity"
  identity_cache_members = local.identity_cache ? [for i in range(1 + var.identity_cache.replicas) : format("%s-%03d", local.identity_cache_id, i + 1)] : []
}

# --- Network -----------------------------------------------------------------------------------

resource "aws_security_group" "identity_cache" {
  count = local.identity_cache ? 1 : 0

  name        = "${local.prefix}-identity-cache"
  description = "Identity ElastiCache for Valkey: 6379 from the identity-cache-client group only"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.prefix}-identity-cache" }
  # No egress rule: Terraform removes the default allow-all egress of a new group, and the cache
  # opens no connection of its own.
}

resource "aws_security_group" "identity_cache_client" {
  count = local.identity_cache ? 1 : 0

  name        = "${local.prefix}-identity-cache-client"
  description = "Identity ECS service tasks that may reach the Identity cache; carried by nothing else"
  vpc_id      = aws_vpc.main.id
  tags        = { Name = "${local.prefix}-identity-cache-client" }
}

resource "aws_vpc_security_group_ingress_rule" "identity_cache_from_client" {
  count = local.identity_cache ? 1 : 0

  security_group_id            = aws_security_group.identity_cache[0].id
  description                  = "Valkey over TLS from the Identity service tasks"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.identity_cache_client[0].id
}

resource "aws_vpc_security_group_egress_rule" "identity_cache_client_to_cache" {
  count = local.identity_cache ? 1 : 0

  security_group_id            = aws_security_group.identity_cache_client[0].id
  description                  = "Valkey over TLS to the Identity cache"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.identity_cache[0].id
}

resource "aws_elasticache_subnet_group" "identity" {
  count = local.identity_cache ? 1 : 0

  name        = "${local.prefix}-identity-cache"
  description = "The isolated database subnets (local routes only)"
  subnet_ids  = [for s in aws_subnet.db : s.id]
}

# --- Engine ------------------------------------------------------------------------------------

resource "aws_elasticache_parameter_group" "identity" {
  count = local.identity_cache ? 1 : 0

  name        = "${local.prefix}-identity-valkey8"
  family      = "valkey8"
  description = "Identity security state: noeviction, so a full store refuses writes instead of dropping keys"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

# The slow log only (commands over the engine's threshold): key names, never values, and Identity's
# keys hold no secret in their names (digests and ids). KMS-encrypted like every /munaxa/<env>/ group.
resource "aws_cloudwatch_log_group" "identity_cache" {
  count = local.identity_cache ? 1 : 0

  name              = "/munaxa/${var.environment}/identity-cache"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.data.arn
}

# The AUTH token, read while planning and applying and never stored (modules/secret-key-ephemeral).
# The version is pinned by the identity_cache validation in variables.tf.
module "identity_cache_auth" {
  source = "../modules/secret-key-ephemeral"
  count  = local.identity_cache ? 1 : 0

  providers = { aws = aws.ephemeral_secrets }

  secret_id  = aws_secretsmanager_secret.service["identity"].arn
  version_id = var.secret_version_ids["identity"]
  json_key   = "REDIS_PASSWORD"
}

locals {
  identity_cache_auth_token = local.identity_cache ? module.identity_cache_auth[0].value : null
}

resource "aws_elasticache_replication_group" "identity" {
  count = local.identity_cache ? 1 : 0

  replication_group_id = local.identity_cache_id
  description          = "Munaxa Identity security state: rate limits, lockouts, MFA challenges, replay markers"

  engine               = "valkey"
  engine_version       = var.identity_cache.engine_version
  node_type            = var.identity_cache.node_type
  parameter_group_name = aws_elasticache_parameter_group.identity[0].name
  port                 = 6379

  # Cluster mode disabled: one shard, a primary and 0 or 1 replica. Adding the replica later is
  # replicas = 1: an in-place change on the same primary endpoint.
  num_cache_clusters         = 1 + var.identity_cache.replicas
  automatic_failover_enabled = var.identity_cache.replicas > 0
  multi_az_enabled           = var.identity_cache.replicas > 0

  subnet_group_name  = aws_elasticache_subnet_group.identity[0].name
  security_group_ids = [aws_security_group.identity_cache[0].id]
  network_type       = "ipv4"
  ip_discovery       = "ipv4"

  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.data.arn

  # Write-only: sent to ElastiCache when auth_token_wo_version changes, never kept in state or plan.
  # Rotation: write the new REDIS_PASSWORD (and REDIS_URL) as a new bundle version, pin it, bump
  # auth_token_version with ROTATE (old and new both accepted), roll Identity onto the new version,
  # then bump again with SET to drop the old token (README, "Identity cache: AUTH token").
  auth_token_wo              = local.identity_cache_auth_token
  auth_token_wo_version      = var.identity_cache.auth_token_version
  auth_token_update_strategy = var.identity_cache.auth_token_update_strategy

  snapshot_retention_limit   = 0
  final_snapshot_identifier  = null
  maintenance_window         = "sun:03:30-sun:04:30" # after the database's sun:02:30-03:30
  auto_minor_version_upgrade = true
  apply_immediately          = false

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.identity_cache[0].name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  lifecycle {
    # ElastiCache's own AUTH rules (16-128 printable characters, no " / @) narrowed to what is safe
    # inside REDIS_URL without encoding, and to at least 32 characters. The message never quotes it.
    precondition {
      condition     = can(regex("^[A-Za-z0-9_~.-]{32,128}$", local.identity_cache_auth_token))
      error_message = "REDIS_PASSWORD in the pinned munaxa-<env>/identity bundle version is missing or is not 32-128 URL-safe characters ([A-Za-z0-9_~.-]). Write a new bundle version and pin it."
    }

    postcondition {
      condition     = self.transit_encryption_enabled && self.transit_encryption_mode == "required" && self.at_rest_encryption_enabled
      error_message = "The Identity cache must require TLS and encrypt at rest."
    }
  }
}

# --- Alarms ------------------------------------------------------------------------------------

# Operations notifications. The email subscription is an operator action (console), never an
# address in this public repository. Encrypted with the data key; the key policy admits CloudWatch
# for this (data.tf, statement CloudWatchAlarmsToOpsTopic).
resource "aws_sns_topic" "ops" {
  count = local.identity_cache ? 1 : 0

  name              = "${local.prefix}-ops"
  kms_master_key_id = aws_kms_key.data.arn
}

data "aws_iam_policy_document" "ops_topic" {
  count = local.identity_cache ? 1 : 0

  statement {
    sid       = "CloudWatchAlarmsOfThisAccount"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ops[0].arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:${var.region}:${var.account_id}:alarm:*"]
    }
  }

  statement {
    sid       = "TlsOnly"
    effect    = "Deny"
    actions   = ["sns:Publish", "sns:Subscribe"]
    resources = [aws_sns_topic.ops[0].arn]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sns_topic_policy" "ops" {
  count = local.identity_cache ? 1 : 0

  arn    = aws_sns_topic.ops[0].arn
  policy = data.aws_iam_policy_document.ops_topic[0].json
}

locals {
  # Per member cluster. Thresholds: report 01 section 7.9 (provisional, revisit after a month).
  identity_cache_alarms = merge([for member in local.identity_cache_members : {
    "${member}-cpu" = {
      member = member, metric = "CPUUtilization", statistic = "Average", threshold = 80, periods = 3, missing = "notBreaching"
      text   = "Host CPU above 80 % for 15 minutes (the metric for nodes with 2 vCPUs or fewer)."
    }
    "${member}-memory" = {
      member = member, metric = "DatabaseMemoryUsagePercentage", statistic = "Maximum", threshold = 70, periods = 1, missing = "breaching"
      text   = "Memory above 70 %. With noeviction a full store refuses writes and sign-in answers 503; scale the node type. Missing data (the node is gone) also alarms."
    }
    "${member}-evictions" = {
      member = member, metric = "Evictions", statistic = "Sum", threshold = 0, periods = 1, missing = "notBreaching"
      text   = "Any eviction. With noeviction this must never happen: the parameter group is wrong, and lockout or replay keys may have been dropped."
    }
    "${member}-connections" = {
      member = member, metric = "CurrConnections", statistic = "Maximum", threshold = 200, periods = 1, missing = "notBreaching"
      text   = "More than 200 connections. Identity holds one per task, so this is a leak or a client that should not be there."
    }
  }]...)

  # The replica only: how far it is behind the primary.
  identity_cache_replication_alarms = { for member in slice(local.identity_cache_members, min(1, length(local.identity_cache_members)), length(local.identity_cache_members)) : "${member}-replication-lag" => {
    member = member, metric = "ReplicationLag", statistic = "Maximum", threshold = 5, periods = 1, missing = "notBreaching"
    text   = "The replica is more than 5 seconds behind: a failover now would lose recent lockout and replay writes."
  } }
}

resource "aws_cloudwatch_metric_alarm" "identity_cache" {
  for_each = merge(local.identity_cache_alarms, local.identity_cache_replication_alarms)

  alarm_name          = "${local.prefix}-identity-cache-${trimprefix(each.key, "${local.identity_cache_id}-")}"
  alarm_description   = each.value.text
  namespace           = "AWS/ElastiCache"
  metric_name         = each.value.metric
  dimensions          = { CacheClusterId = each.value.member }
  statistic           = each.value.statistic
  period              = 300
  evaluation_periods  = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = each.value.missing
  alarm_actions       = [aws_sns_topic.ops[0].arn]
  ok_actions          = [aws_sns_topic.ops[0].arn]

  depends_on = [aws_elasticache_replication_group.identity]
}
