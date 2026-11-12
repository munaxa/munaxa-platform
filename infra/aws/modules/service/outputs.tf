output "security_group_id" {
  value = aws_security_group.this.id
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "task_role_arn" {
  value = var.task_role_policy_json == null ? null : aws_iam_role.task[0].arn
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "service_name" {
  value = var.create_service ? aws_ecs_service.this[0].name : null
}

output "listener_rule_paths" {
  description = "Path patterns per listener rule priority (for plan tests)."
  value       = { for k, r in local.route_map : k => r.paths }
}

output "task_definition_container_definitions" {
  description = "The rendered container definitions (for plan tests). Names and secret ARNs only; never a secret value."
  value       = aws_ecs_task_definition.this.container_definitions
}

output "execution_role_grants" {
  description = "What the execution role's policy names (for plan tests): its one ECR repository, its one log group and its one secret bundle (null without one). The policy JSON itself is rendered by the provider."
  value = {
    image_repository_arn = local.image_repository_arn
    log_group            = aws_cloudwatch_log_group.this.name
    secret_arn           = local.reads_secret ? var.secret_arn : null
  }
}

output "service_deployment" {
  description = "The ECS service's deployment settings, desired count and security groups (for plan tests). Null without a service."
  value = var.create_service ? {
    minimum_healthy_percent = aws_ecs_service.this[0].deployment_minimum_healthy_percent
    maximum_percent         = aws_ecs_service.this[0].deployment_maximum_percent
    circuit_breaker         = aws_ecs_service.this[0].deployment_circuit_breaker[0].enable
    circuit_rollback        = aws_ecs_service.this[0].deployment_circuit_breaker[0].rollback
    desired_count           = aws_ecs_service.this[0].desired_count
    security_groups         = aws_ecs_service.this[0].network_configuration[0].security_groups
  } : null
}
