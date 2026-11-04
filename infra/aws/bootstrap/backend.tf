# First apply: comment this block out, apply with local state, then uncomment and run
# `terraform init -migrate-state` so the bootstrap's own state lives in the bucket it created.
terraform {
  backend "s3" {
    bucket  = "munaxa-shared-tfstate-229251310592"
    key     = "bootstrap/terraform.tfstate"
    region  = "eu-central-1"
    encrypt = true
    # The state key, as stack/envs/*.backend.hcl (platform#37). Without it, encrypt = true makes the
    # backend write the state and its lock file with SSE-S3 (AES256), overriding the bucket's
    # default key. A change here needs `terraform init -reconfigure` (same bucket and key, nothing
    # to migrate); the next apply writes the state as SSE-KMS, earlier versions stay SSE-S3.
    kms_key_id   = "arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-tfstate"
    use_lockfile = true
  }
}
