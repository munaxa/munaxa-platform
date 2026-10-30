# First apply: comment this block out, apply with local state, then uncomment and run
# `terraform init -migrate-state` so the bootstrap's own state lives in the bucket it created.
terraform {
  backend "s3" {
    bucket       = "munaxa-shared-tfstate-229251310592"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
