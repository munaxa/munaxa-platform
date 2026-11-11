# --- Identity's in-AWS session probe (run-only) --------------------------------------------------
#
# A one-off Fargate task that checks a running Identity end to end through the ALB (TLS, health,
# sign-in, session, offline ES256 JWT verification, refresh, logout, replay, edge rules) and prints
# only PASS/FAIL lines (pre-authorization review BL-1, BL-4; report
# 2026-11-11-identity-probe-task-definition). It is the identity-bootstrap task's sibling, not a
# command override of it, so that the probe never holds the migration owner's database URL.
#
# What it is given, and nothing else:
#   - secrets: IDENTITY_OWNER_EMAIL and IDENTITY_OWNER_PASSWORD, the two fields of the one-run
#     secret munaxa-<env>/identity-bootstrap. Not DIRECT_DATABASE_URL, no migrate or service
#     bundle, no RDS master secret.
#   - environment: public values only (hosts, issuer, audiences, organisation, signing kid and the
#     public keys, the probe pin). The ALB's DNS name changes every session, so PROBE_ALB_DNS is
#     the one run-task override.
#
# What it reuses, unchanged:
#   - the identity_api image digest (Node 22, non-root `identity` user);
#   - the identity-bootstrap execution role, whose policy already allows pulling that image,
#     reading munaxa-<env>/identity-bootstrap and writing to the ops log group. The execution role
#     is used by the ECS agent to pull the image and resolve the two secrets; the container never
#     receives its credentials. There is no task role, so the container has no AWS credentials at
#     all and the probe cannot call an AWS API. The role's policy also allows the identity-migrate
#     bundle, but ECS resolves only the secrets a container definition names, and this one names
#     two fields of identity-bootstrap.
#   - the ops log group, stream prefix identity-probe.
#
# Run it with the identity task group (module.identity: egress 443, and 5432 to the database,
# which the probe has no credential for) in the public subnets with a public IP:
# `run_task_network.subnets`, `identity_group`, assignPublicIp ENABLED. The only run-task
# override is the PROBE_ALB_DNS environment value. No role, policy or security group is added.
#
# It exists only once identity_probe_source pins a reviewed probe commit, so merging this file
# changes no plan. Pinning it is a configuration PR with its own apply (README "Every
# configuration PR needs its own apply"): the session workflow refuses task definition changes.

locals {
  identity_probe_enabled = local.defined.identity_api && var.identity_probe_source.commit != ""

  # The certificate covers *.<domain>; a name under it that no listener rule routes.
  identity_probe_unknown_host = join(".", concat(["unknown"], slice(split(".", var.hosts.identity), 1, length(split(".", var.hosts.identity)))))

  identity_probe_loader = replace(
    replace(file("${path.module}/scripts/identity-probe-loader.mjs"), "__PROBE_COMMIT__", var.identity_probe_source.commit),
    "__PROBE_SHA256__", var.identity_probe_source.sha256,
  )
}

resource "aws_ecs_task_definition" "identity_probe" {
  count = local.identity_probe_enabled ? 1 : 0

  family                   = "${local.prefix}-identity-probe"
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.identity_bootstrap_execution[0].arn
  # No task_role_arn: the probe must not reach AWS APIs.

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "identity-probe"
    image                  = var.images.identity_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    stopTimeout            = 10
    command                = ["node", "--input-type=module", "-e", local.identity_probe_loader]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PROBE_COMMIT", value = var.identity_probe_source.commit },
      { name = "PROBE_SHA256", value = var.identity_probe_source.sha256 },
      { name = "PROBE_HOST", value = var.hosts.identity },
      { name = "PROBE_ISSUER", value = local.https.identity },
      { name = "PROBE_AUDIENCES", value = "munaxa-work,munaxa-control" },
      { name = "PROBE_ORGANISATION", value = var.identity_operator_organisation.slug },
      { name = "PROBE_SIGNING_KID", value = var.identity_signing_kid },
      { name = "PROBE_PUBLIC_KEYS", value = var.identity_public_keys },
      { name = "PROBE_OPERATOR_HOST", value = var.hosts.operator },
      { name = "PROBE_CONTROL_API_HOST", value = var.hosts.control_api },
      { name = "PROBE_UNKNOWN_HOST", value = local.identity_probe_unknown_host },
    ]
    # The bootstrap task's IDENTITY_OWNER_* fields only (ops.tf); never DIRECT_DATABASE_URL.
    secrets = [
      { name = "IDENTITY_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_EMAIL::" },
      { name = "IDENTITY_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_PASSWORD::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "identity-probe"
      }
    }
  }])
}
