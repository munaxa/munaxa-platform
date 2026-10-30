variable "account_id" {
  type    = string
  default = "229251310592"
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "github_owner" {
  type    = string
  default = "munaxa"
}

# The immutable GitHub identifiers (owner@id/name@id subjects), so a renamed or re-created
# repository or organisation of the same name can never match a trust policy.
variable "github_owner_id" {
  type    = string
  default = "311481412"
}

variable "github_repositories" {
  description = "Repository ids by name. munaxa-platform runs Terraform; the products publish images."
  type        = map(string)
  default = {
    munaxa-platform = "1318353961"
    munaxa-identity = "1354378376"
    munaxa-control  = "1434295290"
    munaxa-work     = "1318345640"
    munaxa-school   = "1318345275"
  }
}

variable "image_repositories" {
  description = "ECR repositories per product repository: munaxa-<product>/<image>."
  type        = map(list(string))
  default = {
    munaxa-identity = ["api", "migrate"]
    munaxa-control  = ["api", "migrate", "portal"]
    munaxa-work     = ["api", "admin", "migrate"]
    munaxa-school   = ["api", "admin", "migrate"]
  }
}

variable "deploy_environments" {
  description = "Per stack environment, the GitHub environments of munaxa-platform whose main-branch jobs may run its Terraform (one CI role and one deployer each, R-17)."
  type        = map(list(string))
  default = {
    nonprod = ["aws-nonprod", "aws-nonprod-session"]
    prod    = ["aws-prod"]
  }

  validation {
    condition     = toset(keys(var.deploy_environments)) == toset(["nonprod", "prod"])
    error_message = "deploy_environments has exactly the keys nonprod and prod."
  }
}

variable "budget_limit_usd" {
  description = "The account's monthly budget (owner decision, 29 Oct 2026)."
  type        = number
  default     = 50
}

variable "testing_budget_limit_usd" {
  description = "Testing's own monthly budget, on resources tagged Environment = nonprod (owner decision, 30 Oct 2026)."
  type        = number
  default     = 50
}

variable "budget_alert_emails" {
  type    = list(string)
  default = ["admin@munaxa.com", "alert@munaxa.com"]
}
