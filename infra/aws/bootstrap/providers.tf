# Applied by root in AWS CloudShell, once and then for each reviewed change, exactly as Munaxa Docs'
# bootstrap is (owner decision: root is the only human identity until launch; no IAM users, no
# access keys, no credentials copied anywhere). Never run by CI.
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project   = "munaxa"
      Stack     = "shared-bootstrap"
      ManagedBy = "terraform/munaxa-platform/infra/aws/bootstrap"
    }
  }
}
