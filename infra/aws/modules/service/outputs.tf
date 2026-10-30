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
