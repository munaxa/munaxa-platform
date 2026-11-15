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
# Account mode (identity_probe_account; Stage E blockers BE-3 and BE-4, report
# 2026-11-14-identity-stage-e-blockers-remediation, files 03 and 04). The default is "throwaway":
# the probe never signs in as the operator. The task then has two containers:
#   - throwaway-account (non-essential, runs first): its only secret is DIRECT_DATABASE_URL (the
#     identity-migrate bundle's owner URL at the pinned version, which the identity-bootstrap
#     execution role already reads). It runs the image's own bootstrap-account.mjs once to create a
#     synthetic account (stage-e-<hex>@stage-e.invalid, organisation munaxa-stage-e-checks, no
#     role), prints its sub, writes the credential to the task's ephemeral hand-off volume and exits.
#   - identity-probe (essential): starts only when the account container exited 0 (dependsOn
#     SUCCESS), has no secret at all, reads and deletes the hand-off file, and runs 28 checks,
#     including the MFA lifecycle and the lockout, against that account only. It runs in its own
#     process and PID namespace (no pidMode), so the downloaded probe can never read the database
#     URL, not from its environment and not from /proc (security review finding S-1).
# The hand-off volume is a Fargate bind mount at /stage-e. Fargate creates it empty, owned by root,
# mode 0755 (the image declares no VOLUME there; fix-check finding N-1), so the account container
# runs as uid 0 (still read-only root filesystem, every capability dropped, no task role) and writes
# the hand-off file 0644; the probe container stays the non-root identity user and can only read it.
# "operator" restores the original single-container design above (the two operator fields of
# identity-bootstrap, 15 checks, no database URL). It is inert since the L-A0 redesign (owner
# decisions D-BE4 and D-LA0, report 2026-11-15-identity-stage-e-owner-decisions, file 03): the
# one-run identity-bootstrap secret is never created any more and the execution role can no longer
# read it, so an operator-mode probe fails at task start. It is deliberately NOT pointed at
# identity-operator: the probe container runs downloaded code and must never receive that password.
#
# It exists only once identity_probe_source pins a reviewed probe commit, so merging this file
# changes no plan. Pinning it is a configuration PR with its own apply (README "Every
# configuration PR needs its own apply"): the session workflow refuses task definition changes.

locals {
  identity_probe_enabled   = local.defined.identity_api && var.identity_probe_source.commit != ""
  identity_probe_throwaway = var.identity_probe_account == "throwaway"
  # The task's ephemeral hand-off volume (Fargate bind mount: empty, root-owned, 0755).
  identity_probe_handoff_dir = "/stage-e"

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

  dynamic "volume" {
    for_each = local.identity_probe_throwaway ? ["stage-e-handoff"] : []
    content {
      name = volume.value
    }
  }

  # jsondecode(cond ? jsonencode(a) : jsonencode(b)) keeps each branch's own types (a plain
  # conditional would unify the two objects and turn booleans into strings).
  container_definitions = jsonencode(concat(jsondecode(local.identity_probe_throwaway ? jsonencode([{
    name                   = "throwaway-account"
    image                  = var.images.identity_api
    essential              = false
    user                   = "0" # the only user that can write the root-owned bind mount
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    stopTimeout            = 10
    command                = ["node", "--input-type=module", "-e", local.identity_probe_loader]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PROBE_STAGE", value = "account" },
      { name = "PROBE_ACCOUNT", value = "throwaway" },
      { name = "PROBE_HANDOFF_DIR", value = local.identity_probe_handoff_dir },
    ]
    # The identity-migrate owner URL only, pinned like identity-bootstrap's, for the one
    # bootstrap-account.mjs call. Never given to the probe container.
    secrets = [
      { name = "DIRECT_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.service["identity-migrate"].arn}:DATABASE_MIGRATION_URL::${lookup(var.secret_version_ids, "identity-migrate", "")}" },
    ]
    mountPoints = [{ sourceVolume = "stage-e-handoff", containerPath = local.identity_probe_handoff_dir, readOnly = false }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "identity-probe"
      }
    }
    }]) : "[]"), [merge({
    name                   = "identity-probe"
    image                  = var.images.identity_api
    essential              = true
    readonlyRootFilesystem = true
    linuxParameters        = { capabilities = { add = [], drop = ["ALL"] } }
    stopTimeout            = 10
    command                = ["node", "--input-type=module", "-e", local.identity_probe_loader]
    environment = concat([
      { name = "NODE_ENV", value = "production" },
      { name = "PROBE_STAGE", value = "probe" },
      { name = "PROBE_COMMIT", value = var.identity_probe_source.commit },
      { name = "PROBE_SHA256", value = var.identity_probe_source.sha256 },
      { name = "PROBE_HOST", value = var.hosts.identity },
      { name = "PROBE_ISSUER", value = local.https.identity },
      { name = "PROBE_AUDIENCES", value = "munaxa-work,munaxa-control" },
      { name = "PROBE_ACCOUNT", value = var.identity_probe_account },
      { name = "PROBE_ORGANISATION", value = local.identity_probe_throwaway ? "munaxa-stage-e-checks" : var.identity_operator_organisation.slug },
      { name = "PROBE_SIGNING_KID", value = var.identity_signing_kid },
      { name = "PROBE_PUBLIC_KEYS", value = var.identity_public_keys },
      { name = "PROBE_OPERATOR_HOST", value = var.hosts.operator },
      { name = "PROBE_CONTROL_API_HOST", value = var.hosts.control_api },
      { name = "PROBE_UNKNOWN_HOST", value = local.identity_probe_unknown_host },
    ], local.identity_probe_throwaway ? [{ name = "PROBE_HANDOFF_DIR", value = local.identity_probe_handoff_dir }] : [])
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ops.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "identity-probe"
      }
    }
    }, jsondecode(local.identity_probe_throwaway ? jsonencode({
      # No secret: the credential comes from the hand-off volume.
      secrets     = []
      mountPoints = [{ sourceVolume = "stage-e-handoff", containerPath = local.identity_probe_handoff_dir, readOnly = true }]
      dependsOn   = [{ containerName = "throwaway-account", condition = "SUCCESS" }]
      }) : jsonencode({
      # Operator: the bootstrap task's IDENTITY_OWNER_* fields only (ops.tf), never DIRECT_DATABASE_URL.
      secrets = [
        { name = "IDENTITY_OWNER_EMAIL", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_EMAIL::" },
        { name = "IDENTITY_OWNER_PASSWORD", valueFrom = "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:${local.prefix}/identity-bootstrap:IDENTITY_OWNER_PASSWORD::" },
      ]
  })))]))
}
