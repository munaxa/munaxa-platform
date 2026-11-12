# Reads one JSON key of one pinned Secrets Manager secret version as an ephemeral value: never in a
# plan, a state file or a log. An ephemeral value may flow only into write-only arguments, provider
# configuration and other ephemeral values (Terraform 1.10+).
#
# Its own module so the mocked plan tests can replace it (override_module): Terraform's provider
# mocks do not support ephemeral resources (Terraform 1.16.5: "The provider mocking mechanism does
# not yet support ephemeral resource types"), even at count 0.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

variable "secret_id" {
  description = "The secret's ARN."
  type        = string
}

variable "version_id" {
  description = "The pinned version id. Never AWSCURRENT implicitly: an empty value is refused."
  type        = string

  validation {
    condition     = var.version_id != ""
    error_message = "version_id is a pinned secret version id."
  }
}

variable "json_key" {
  description = "The JSON key of the secret string to return."
  type        = string
}

ephemeral "aws_secretsmanager_secret_version" "this" {
  secret_id  = var.secret_id
  version_id = var.version_id
}

output "value" {
  description = "The key's value, or \"\" when the secret is not JSON or lacks the key (the caller's precondition refuses that, without quoting the secret)."
  ephemeral   = true
  sensitive   = true
  value       = try(tostring(jsondecode(ephemeral.aws_secretsmanager_secret_version.this.secret_string)[var.json_key]), "")
}
