output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "deployer_role_arns" {
  description = "AWS_DEPLOYER_ROLE_ARN, an environment variable of each munaxa-platform GitHub environment: nonprod for aws-nonprod and aws-nonprod-session, prod for aws-prod."
  value       = { for k, r in aws_iam_role.deployer : k => r.arn }
}

output "ci_role_arns" {
  description = "AWS_CI_ROLE_ARN, an environment variable of each munaxa-platform GitHub environment, as for deployer_role_arns."
  value       = { for k, r in aws_iam_role.ci : k => r.arn }
}

output "image_publisher_role_arns" {
  description = "Each product repository's variable AWS_IMAGE_PUBLISHER_ROLE_ARN."
  value       = { for k, r in aws_iam_role.publisher : k => r.arn }
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.image : k => r.repository_url }
}

output "workload_boundary_arn" {
  value = aws_iam_policy.workload_boundary.arn
}
