# One Munaxa service on ECS Fargate in the shared environment stack (shared AWS hosting ADR, draft).
#
# What every service gets, and nothing it does not need:
#
# | Resource             | Notes                                                                   |
# | -------------------- | ----------------------------------------------------------------------- |
# | Log group            | /munaxa/<env>/<service>, retention per environment                      |
# | Execution role       | Pulls its own image's ECR repository and reads its own secret bundle    |
# | Task role            | Only when the service calls AWS itself (Control: kms:Sign)              |
# | Security group       | Ingress on the container port from the ALB and named callers; egress    |
# |                      | 443 anywhere (ECR, Secrets Manager, KMS, Control, Identity) and 5432 to  |
# |                      | the database security group only                                        |
# | Task definition      | By image digest; skip_destroy keeps old revisions as rollback targets   |
# | Service              | Public subnets with a public IPv4 address, no NAT; circuit breaker with  |
# |                      | rollback                                                                |
# | Target group, rules  | Host (and optional path) rules on the shared HTTPS listener              |
#
# A run-only task (create_service = false) is the task definition, roles and security group: a
# migration or sweep, run by a workflow or a schedule.

locals {
  id        = "${var.prefix}-${var.name}"
  log_group = "/munaxa/${trimprefix(var.prefix, "munaxa-")}/${var.name}"
  # The ECR repository the image lives in, read from the digest reference.
  image_repository_arn = format(
    "arn:aws:ecr:%s:%s:repository/%s",
    var.region,
    var.account_id,
    regex("^[^/]+/([^@]+)@", var.image)[0],
  )
  secret_refs = concat(
    [for key in var.secret_keys : { name = key, valueFrom = "${var.secret_arn}:${key}::${var.secret_version_id}" }],
    [for name, key in var.secret_aliases : { name = name, valueFrom = "${var.secret_arn}:${key}::${var.secret_version_id}" }],
  )
  reads_secret    = length(var.secret_keys) + length(var.secret_aliases) > 0
  no_capabilities = { capabilities = { add = [], drop = ["ALL"] } }
  route_map       = { for r in var.routes : tostring(r.priority) => r }
}

resource "aws_cloudwatch_log_group" "this" {
  name              = local.log_group
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

# --- Roles -------------------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    # The confused-deputy guard: only ECS tasks in this account.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name                 = "${local.id}-execution"
  path                 = "/munaxa-shared/"
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  tags                 = var.tags
}

data "aws_iam_policy_document" "execution" {
  statement {
    sid       = "EcrSignIn"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "PullOwnImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [local.image_repository_arn]
  }
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }
  dynamic "statement" {
    for_each = local.reads_secret ? [1] : []
    content {
      sid       = "ReadOwnSecretBundle"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.secret_arn]
    }
  }
  dynamic "statement" {
    for_each = local.reads_secret ? [1] : []
    content {
      sid       = "DecryptOwnSecretBundle"
      actions   = ["kms:Decrypt"]
      resources = [var.secrets_kms_key_arn]
      condition {
        test     = "StringEquals"
        variable = "kms:ViaService"
        values   = ["secretsmanager.${var.region}.amazonaws.com"]
      }
    }
  }
}

resource "aws_iam_role_policy" "execution" {
  name   = "execution"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

resource "aws_iam_role" "task" {
  count = var.task_role_policy_json == null ? 0 : 1

  name                 = "${local.id}-task"
  path                 = "/munaxa-shared/"
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/munaxa-shared/munaxa-shared-workload-boundary"
  tags                 = var.tags
}

resource "aws_iam_role_policy" "task" {
  count = var.task_role_policy_json == null ? 0 : 1

  name   = "task"
  role   = aws_iam_role.task[0].id
  policy = var.task_role_policy_json
}

# --- Network -----------------------------------------------------------------------------------

resource "aws_security_group" "this" {
  name        = local.id
  description = "Munaxa ${var.name} tasks"
  vpc_id      = var.vpc_id
  tags        = merge(var.tags, { Name = local.id })
}

resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.this.id
  description       = "HTTPS: ECR, Secrets Manager, KMS, logs, and Munaxa Identity and Control by their public names"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "database" {
  count = var.connect_database ? 1 : 0

  security_group_id            = aws_security_group.this.id
  description                  = "PostgreSQL on the shared instance"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = var.database_security_group_id
}

resource "aws_vpc_security_group_egress_rule" "to_services" {
  for_each = var.egress_to

  security_group_id            = aws_security_group.this.id
  description                  = "Private calls to ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
  referenced_security_group_id = each.value.security_group_id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_service" {
  count = var.connect_database ? 1 : 0

  security_group_id            = var.database_security_group_id
  description                  = "PostgreSQL from ${var.name}"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.this.id
}

resource "aws_vpc_security_group_ingress_rule" "from_alb" {
  count = var.routed ? 1 : 0

  security_group_id            = aws_security_group.this.id
  description                  = "The shared ALB"
  ip_protocol                  = "tcp"
  from_port                    = var.port
  to_port                      = var.port
  referenced_security_group_id = var.alb_security_group_id
}

resource "aws_vpc_security_group_ingress_rule" "from_callers" {
  for_each = var.port == null ? {} : var.ingress_security_group_ids

  security_group_id            = aws_security_group.this.id
  description                  = "Private calls from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = var.port
  to_port                      = var.port
  referenced_security_group_id = each.value
}

# --- Task definition ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = local.id
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = var.task_role_policy_json == null ? null : aws_iam_role.task[0].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode(concat([merge(
    {
      name                   = var.name
      image                  = var.image
      essential              = true
      readonlyRootFilesystem = var.readonly_root_filesystem
      linuxParameters        = local.no_capabilities
      environment            = [for k in sort(keys(var.environment)) : { name = k, value = var.environment[k] }]
      secrets                = local.secret_refs
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = var.region
          awslogs-stream-prefix = var.name
        }
      }
    },
    var.port == null ? {} : { portMappings = [{ containerPort = var.port, hostPort = var.port, protocol = "tcp" }] },
    var.command == null ? {} : { command = var.command },
    var.health_check_command == null ? {} : {
      healthCheck = { command = var.health_check_command, interval = 15, timeout = 5, retries = 3, startPeriod = var.health_check_start_period }
    },
    length(var.depends_on_sidecars) == 0 ? {} : {
      dependsOn = [for c in var.depends_on_sidecars : { containerName = c, condition = "HEALTHY" }]
    },
  )], var.sidecars))

  tags = var.tags
}

# --- Edge --------------------------------------------------------------------------------------

resource "aws_lb_target_group" "this" {
  count = var.create_service && var.routed ? 1 : 0

  name                 = substr(local.id, 0, 32)
  port                 = var.port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 15

  health_check {
    path                = var.health_check_path
    matcher             = "200-399"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = var.tags
}

resource "aws_lb_listener_rule" "this" {
  for_each = var.create_service && var.routed ? local.route_map : {}

  listener_arn = var.listener_arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[0].arn
  }

  condition {
    host_header {
      values = each.value.hosts
    }
  }

  dynamic "condition" {
    for_each = length(each.value.paths) > 0 ? [1] : []
    content {
      path_pattern {
        values = each.value.paths
      }
    }
  }

  dynamic "condition" {
    for_each = length(each.value.source_ips) > 0 ? [1] : []
    content {
      source_ip {
        values = each.value.source_ips
      }
    }
  }

  tags = var.tags
}

# --- Service -----------------------------------------------------------------------------------

resource "aws_service_discovery_service" "this" {
  count = var.create_service && var.register_discovery ? 1 : 0

  name = var.name

  dns_config {
    namespace_id   = var.discovery_namespace_id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

resource "aws_ecs_service" "this" {
  count = var.create_service ? 1 : 0

  name                   = var.name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.this.arn
  desired_count          = var.desired_count
  launch_type            = "FARGATE"
  enable_execute_command = false
  propagate_tags         = "SERVICE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.this.id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  dynamic "load_balancer" {
    for_each = var.routed ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.this[0].arn
      container_name   = var.name
      container_port   = var.port
    }
  }

  dynamic "service_registries" {
    for_each = var.register_discovery ? [1] : []
    content {
      registry_arn = aws_service_discovery_service.this[0].arn
    }
  }

  depends_on = [aws_lb_listener_rule.this]
  tags       = var.tags
}
