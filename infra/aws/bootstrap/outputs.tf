output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "deployer_role_arns" {
  description = "AWS_DEPLOYER_ROLE_ARN: nonprod as the repository variable (aws-nonprod), prod for aws-prod. aws-nonprod-session uses session_deployer_role_arns."
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
  description = "The nonprod workload boundary (the name stack/ uses). See workload_boundary_arns."
  value       = aws_iam_policy.workload_boundary["nonprod"].arn
}

output "workload_boundary_arns" {
  description = "Each environment's workload boundary (finding H-1)."
  value       = { for k, p in aws_iam_policy.workload_boundary : k => p.arn }
}

output "session_ci_role_arns" {
  description = "AWS_CI_ROLE_ARN as an environment variable of aws-nonprod-session (overrides the repository variable; finding H-3)."
  value       = { for k, r in aws_iam_role.ci_session : k => r.arn }
}

output "session_deployer_role_arns" {
  description = "AWS_DEPLOYER_ROLE_ARN as an environment variable of aws-nonprod-session."
  value       = { for k, r in aws_iam_role.deployer_session : k => r.arn }
}
