output "alb_dns_name" {
  description = "The CNAME target for every host in Cloudflare (owner action). Null while the edge is off."
  value       = var.edge_enabled ? aws_lb.main[0].dns_name : null
}

output "certificate_validation_records" {
  description = "DNS records to add in Cloudflare (DNS only, not proxied) so ACM issues and renews the certificate."
  value = [for o in aws_acm_certificate.main.domain_validation_options : {
    name  = o.resource_record_name
    type  = o.resource_record_type
    value = o.resource_record_value
  }]
}

output "hosts" {
  value = var.hosts
}

output "database_endpoint" {
  description = "Private address of the shared PostgreSQL instance; the services' URLs use it."
  value       = aws_db_instance.main.address
}

output "secret_bundles" {
  description = "Bundle names to fill, by service. Keys are listed in data.tf."
  value       = { for k, v in aws_secretsmanager_secret.service : k => v.name }
}

output "file_buckets" {
  description = "Object storage per product (storage.tf)."
  value       = { for k, b in aws_s3_bucket.files : k => b.bucket }
}

output "control_licence_key_arn" {
  description = "Read its public half with `aws kms get-public-key` for control_licence_public_key."
  value       = length(aws_kms_key.licence) > 0 ? aws_kms_key.licence[0].arn : null
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "run_task_network" {
  description = "Network settings for `aws ecs run-task` (db-admin and migrations)."
  value = {
    subnets             = [for s in aws_subnet.public : s.id]
    db_admin_group      = aws_security_group.db_admin.id
    migrate_groups      = merge({ for k, m in module.migrate : k => m.security_group_id }, length(module.control_migrate) > 0 ? { control = module.control_migrate[0].security_group_id } : {})
    db_admin_definition = length(aws_ecs_task_definition.db_admin) > 0 ? aws_ecs_task_definition.db_admin[0].family : null
    # Docs: docs-db-admin runs with db_admin_group; docs-provision with docs_api_group.
    docs_db_admin_definition  = length(aws_ecs_task_definition.docs_db_admin) > 0 ? aws_ecs_task_definition.docs_db_admin[0].family : null
    docs_provision_definition = length(aws_ecs_task_definition.docs_provision) > 0 ? aws_ecs_task_definition.docs_provision[0].family : null
    docs_api_group            = length(module.docs_api) > 0 ? module.docs_api[0].security_group_id : null
    # identity-bootstrap runs with db_admin_group, after identity-migrate.
    identity_bootstrap_definition = length(aws_ecs_task_definition.identity_bootstrap) > 0 ? aws_ecs_task_definition.identity_bootstrap[0].family : null
    # school-bootstrap runs with db_admin_group, after school-migrate.
    school_bootstrap_definition = length(aws_ecs_task_definition.school_bootstrap) > 0 ? aws_ecs_task_definition.school_bootstrap[0].family : null
  }
}
