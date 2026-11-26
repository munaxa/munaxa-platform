# Work demo starter data (work-demo.tf, report 2026-11-26-work-testing-like-docs). Plan only, mocked
# AWS provider, no credentials, no AWS call. Digests and version ids are PLACEHOLDERS.
#
#   terraform init -backend=false && terraform test -filter=tests/work-demo.tftest.hcl

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

# The ephemeral read of the Identity cache's AUTH token (identity-cache.tf). Terraform's provider
# mocks reject ephemeral resources, so its provider alias is a real provider that cannot reach AWS
# (fake keys, no account lookup, every endpoint used by the module on 127.0.0.1), and the module is
# replaced, so it never opens the secret. The value is a public placeholder, never a real token.
provider "aws" {
  alias                       = "ephemeral_secrets"
  region                      = "eu-central-1"
  access_key                  = "mock-access-key"
  secret_key                  = "mock-secret-key"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  endpoints {
    secretsmanager = "http://127.0.0.1:9"
    sts            = "http://127.0.0.1:9"
    iam            = "http://127.0.0.1:9"
  }
}

override_module {
  target  = module.identity_cache_auth
  outputs = { value = "mock-placeholder-not-a-token-0123456789" }
}

variables {
  environment = "nonprod"
  account_id  = "229251310592"
  vpc_cidr    = "10.130.0.0/16"
  hosts = {
    identity    = "id.test.munaxa.com"
    control_api = "control-api.test.munaxa.com"
    operator    = "operator.test.munaxa.com"
    work        = "work.test.munaxa.com"
    school      = "school.test.munaxa.com"
  }
  certificate_domains = ["*.test.munaxa.com"]

  # What a session that runs Identity, Work and Control needs (variables.tf validations). Public
  # test values: the keys are syntactically PEM only, never used to verify anything here.
  valkey_image                     = "public.ecr.aws/valkey/valkey@sha256:5555555555555555555555555555555555555555555555555555555555555555"
  identity_signing_kid             = "identity-test-2026-11"
  identity_public_keys             = "[{\"kid\":\"identity-test-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----\"}]"
  control_licence_kid              = "control-test-2026-11"
  control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----"
  control_operator_organisation_id = "00000000-0000-0000-0000-000000000001"
  control_operator_subjects        = ["00000000-0000-0000-0000-000000000002"]

  services_enabled = false
  edge_enabled     = false
  desired_counts = {
    identity   = 0, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
    school-api = 0, school-admin = 0, docs-api = 0, docs-web = 0, docs-scanner = 0
  }
  images = {
    identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    work_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  secret_version_ids = {
    identity-migrate = "66666666-6666-4666-8666-666666666666"
    work-api         = "77777777-7777-4777-8777-777777777777"
  }
}

run "off_by_default" {
  command = plan

  assert {
    condition     = length(aws_ecs_task_definition.work_demo_account) == 0 && length(aws_ecs_task_definition.work_demo_loader) == 0 && length(aws_iam_role.work_demo_execution) == 0
    error_message = "Without work_demo_data_enabled there must be no Work demo task or role (production never has them)."
  }
}

run "needs_both_images" {
  command = plan

  variables {
    work_demo_data_enabled = true
    images = {
      work_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }

  assert {
    condition     = length(aws_ecs_task_definition.work_demo_account) == 0 && length(aws_ecs_task_definition.work_demo_loader) == 0
    error_message = "The Work demo tasks need both the Identity and the Work API image."
  }
}

run "enabled_defines_two_run_only_tasks" {
  command = plan

  variables {
    work_demo_data_enabled = true
  }

  override_resource {
    target          = aws_secretsmanager_secret.service["identity-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-migrate-Id56Mg" }
  }

  assert {
    condition     = length(aws_ecs_task_definition.work_demo_account) == 1 && length(aws_ecs_task_definition.work_demo_loader) == 1
    error_message = "work_demo_data_enabled must define work-demo-account and work-demo-loader."
  }
  assert {
    condition     = module.work_api[0].service_name == null
    error_message = "The demo tasks must not bring a Work service with them."
  }
  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.work_demo_account[0].container_definitions)[0].image == var.images.identity_api
      && jsondecode(aws_ecs_task_definition.work_demo_loader[0].container_definitions)[0].image == var.images.work_api
    )
    error_message = "work-demo-account runs the Identity image, work-demo-loader the Work API image."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.work_demo_account[0].container_definitions)[0].command == ["node", "scripts/bootstrap-account.mjs", "--organisation", "munaxa-group", "--role", "work-testing-org-admin"]
    error_message = "work-demo-account must create the loader account with the org-admin Testing persona only."
  }
  assert {
    condition     = jsondecode(aws_ecs_task_definition.work_demo_loader[0].container_definitions)[0].command == ["node", "../../tooling/testing-data/load-synthetic.mjs"]
    error_message = "work-demo-loader must run the MW-004 loader."
  }
  # The loader reads only the one-run loader secret: never a Work, Identity or operator bundle.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_ecs_task_definition.work_demo_loader[0].container_definitions)[0].secrets :
      startswith(s.valueFrom, "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-demo-loader/munaxa-group:")
    ]) && length(jsondecode(aws_ecs_task_definition.work_demo_loader[0].container_definitions)[0].secrets) == 2
    error_message = "work-demo-loader must read LOADER_IDENTIFIER and LOADER_PASSWORD from the one-run secret only."
  }
  # The account task never reads the operator secret.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_ecs_task_definition.work_demo_account[0].container_definitions)[0].secrets :
      !strcontains(s.valueFrom, "identity-operator")
    ])
    error_message = "work-demo-account must never read the operator's secret."
  }
}
