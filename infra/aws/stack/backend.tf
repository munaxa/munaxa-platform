# Partial configuration: the bucket and key come from envs/<environment>.backend.hcl, so the
# non-production and production states are separate objects that no plan can confuse.
#
#   terraform init -backend-config=envs/nonprod.backend.hcl
terraform {
  backend "s3" {
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
