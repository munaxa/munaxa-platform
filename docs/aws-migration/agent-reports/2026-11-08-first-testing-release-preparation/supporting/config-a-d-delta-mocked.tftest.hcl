# Read-only planning aid for the 2026-11-08 first Testing release preparation report (not part of CI).
# Plan-only with a mocked AWS provider: no credentials, no AWS call. All digests, Access values and keys are FAKE placeholders.
# To run: copy into a scratch copy of infra/aws/stack/tests/, then
#   terraform init -backend=false && terraform test -var-file=envs/nonprod.tfvars -verbose
# Result at 646b7b8 (Terraform 1.16.5, AWS provider 6.67.0): 5 passed, 0 failed. Address lists in mocked-plan-address-deltas.txt.

mock_provider "aws" {
  # Policy documents are rendered by the provider; the mock returns a fixed, valid one.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  # The key policy names the control-api task role; give it an ARN at plan time.
  override_resource {
    target          = module.control_api[0].aws_iam_role.task[0]
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-test-control-api-task" }
  }
  override_resource {
    target = aws_db_instance.main
    values = {
      address            = "munaxa-test-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
}


run "baseline" {
  command = plan
}

run "config_a" {
  command = plan
variables {
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:4444444444444444444444444444444444444444444444444444444444444444"
    control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:5555555555555555555555555555555555555555555555555555555555555555"
  }
  valkey_image          = "public.ecr.aws/valkey/valkey@sha256:6666666666666666666666666666666666666666666666666666666666666666"
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:7777777777777777777777777777777777777777777777777777777777777777"
  operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  identity_signing_kid  = "identity-nonprod-2026-11"
  identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  db_bootstrap_products = ["identity", "control"]
  desired_counts = {
    identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1,
    school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
  }
}

}


run "config_d" {
  command = plan
variables {
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:4444444444444444444444444444444444444444444444444444444444444444"
    control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:5555555555555555555555555555555555555555555555555555555555555555"
    work_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:8888888888888888888888888888888888888888888888888888888888888888"
    work_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:9999999999999999999999999999999999999999999999999999999999999999"
    work_admin   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  valkey_image          = "public.ecr.aws/valkey/valkey@sha256:6666666666666666666666666666666666666666666666666666666666666666"
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:7777777777777777777777777777777777777777777777777777777777777777"
  operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  identity_signing_kid  = "identity-nonprod-2026-11"
  identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  db_bootstrap_products = ["identity", "control", "work"]
  desired_counts = {
    identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1,
    school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
  }
}

}


run "config_a1_identity_only" {
  command = plan
variables {
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  }
  valkey_image          = "public.ecr.aws/valkey/valkey@sha256:6666666666666666666666666666666666666666666666666666666666666666"
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:7777777777777777777777777777777777777777777777777777777777777777"
  identity_signing_kid  = "identity-nonprod-2026-11"
  identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  db_bootstrap_products = ["identity"]
  desired_counts = {
    identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1,
    school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
  }
}

}



run "config_a1_session_up" {
  command = plan
variables {
  edge_enabled     = true
  services_enabled = true
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  }
  valkey_image          = "public.ecr.aws/valkey/valkey@sha256:6666666666666666666666666666666666666666666666666666666666666666"
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:7777777777777777777777777777777777777777777777777777777777777777"
  identity_signing_kid  = "identity-nonprod-2026-11"
  identity_public_keys  = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  db_bootstrap_products = ["identity"]
  desired_counts = {
    identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1,
    school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
  }
}

}


