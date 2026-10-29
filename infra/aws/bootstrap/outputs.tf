output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "deployer_role_arn" {
  value = aws_iam_role.deployer.arn
}

output "ci_role_arn" {
  description = "munaxa-platform repository variable AWS_CI_ROLE_ARN."
  value       = aws_iam_role.ci.arn
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
