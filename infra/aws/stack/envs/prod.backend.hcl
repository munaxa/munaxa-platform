bucket = "munaxa-shared-tfstate-229251310592"
key    = "prod/stack.tfstate"
# The state key (bootstrap/, alias/munaxa-shared-tfstate). Without it, encrypt = true makes the S3
# backend write the state and its lock file with SSE-S3 (AES256), overriding the bucket default key.
kms_key_id = "arn:aws:kms:eu-central-1:229251310592:alias/munaxa-shared-tfstate"
