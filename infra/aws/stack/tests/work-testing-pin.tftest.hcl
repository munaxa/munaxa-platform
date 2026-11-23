# MW-002 (report 2026-11-23-work-testing-pin-package): the Work Testing pin, with services off. Plan
# only, mocked AWS provider, no credentials, no AWS call. The Work digests and the two Work bundle
# version ids are PLACEHOLDERS; the real ones come with the pin PR. The full address set of the pin
# (28 creates, db-admin replaced) is in that report's supporting/work-pin-mocked-output.txt, produced
# with -var-file=envs/nonprod.tfvars; this test keeps its invariants in CI.
#
#   terraform init -backend=false && terraform test -filter=tests/work-testing-pin.tftest.hcl

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
}



run "work_pin_creates_task_definitions_and_no_service" {
  command = plan

  variables {
    services_enabled = false
    edge_enabled     = false
    desired_counts = {
      identity   = 1, control-api = 0, control-portal = 0, work-api = 0, work-admin = 0,
      school-api = 0, school-admin = 0, docs-api = 0, docs-web = 0, docs-scanner = 0
    }
    images = {
      work_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      work_admin   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      work_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
    db_bootstrap_products = ["identity", "control", "work"]
    secret_version_ids = {
      work-api     = "77777777-7777-4777-8777-777777777777"
      work-migrate = "88888888-8888-4888-8888-888888888888"
    }
  }

  override_resource {
    target          = aws_db_instance.main
    override_during = plan
    values = {
      address            = "munaxa-test-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-Id12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-migrate-Id56Mg" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["control-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/control-api-Co12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["control-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/control-migrate-Co56Mg" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["work-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-api-Wk12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["work-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-migrate-Wk56Mg" }
  }

  # Task definitions for api, admin and migrate; no ECS service for any of them (services off).
  assert {
    condition     = length(module.work_api) == 1 && length(module.work_admin) == 1 && contains(keys(module.migrate), "work")
    error_message = "The pin must define work-api, work-admin and work-migrate."
  }
  assert {
    condition     = module.work_api[0].service_name == null && module.work_admin[0].service_name == null
    error_message = "The pin must create no Work ECS service."
  }

  # Each Work task reads its own bundle at the pinned version, never AWSCURRENT.
  assert {
    condition = alltrue([
      for s in jsondecode(module.work_api[0].task_definition_container_definitions)[0].secrets :
      endswith(s.valueFrom, "::77777777-7777-4777-8777-777777777777")
    ])
    error_message = "work-api must read munaxa-nonprod/work-api at the pinned version only."
  }
  assert {
    condition = alltrue([
      for s in jsondecode(module.migrate["work"].task_definition_container_definitions)[0].secrets :
      endswith(s.valueFrom, ":DATABASE_MIGRATION_URL::88888888-8888-4888-8888-888888888888")
    ])
    error_message = "work-migrate must read DATABASE_MIGRATION_URL of munaxa-nonprod/work-migrate at the pinned version only."
  }

  # db-admin creates the work database and roles from the same two pinned bundles.
  assert {
    condition = (
      contains([for s in jsondecode(aws_ecs_task_definition.db_admin[0].container_definitions)[0].secrets : s.name], "WORK_APP_URL")
      && contains([for s in jsondecode(aws_ecs_task_definition.db_admin[0].container_definitions)[0].secrets : s.name], "WORK_OWNER_URL")
      && alltrue([
        for s in jsondecode(aws_ecs_task_definition.db_admin[0].container_definitions)[0].secrets :
        endswith(s.valueFrom, s.name == "WORK_APP_URL" ? ":DATABASE_URL::77777777-7777-4777-8777-777777777777" : ":DATABASE_MIGRATION_URL::88888888-8888-4888-8888-888888888888")
        if startswith(s.name, "WORK_")
      ])
    )
    error_message = "db-admin must carry WORK_APP_URL and WORK_OWNER_URL at the pinned Work versions."
  }

  # Work's API runs against Control and Identity as the stack wires it.
  assert {
    condition = (
      { for e in jsondecode(module.work_api[0].task_definition_container_definitions)[0].environment : e.name => e.value }["LICENSING_MODE"] == "CONTROL_PLANE"
      && { for e in jsondecode(module.work_api[0].task_definition_container_definitions)[0].environment : e.name => e.value }["PLATFORM_AUTH_ISSUER"] == "https://id.test.munaxa.com"
    )
    error_message = "work-api's licensing mode or issuer changed."
  }
}

# Without "work" in db_bootstrap_products, db-admin never reads a Work bundle (the pin needs both).
run "without_work_in_db_admin_no_work_url_is_read" {
  command = plan

  override_resource {
    target          = aws_db_instance.main
    override_during = plan
    values = {
      address            = "munaxa-test-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-Id12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-migrate-Id56Mg" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["control-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/control-api-Co12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["control-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/control-migrate-Co56Mg" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["work-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-api-Wk12Ap" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["work-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-migrate-Wk56Mg" }
  }

  variables {
    images = {
      work_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      work_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"
    db_bootstrap_products = ["identity", "control"]
  }

  assert {
    condition     = length([for s in jsondecode(aws_ecs_task_definition.db_admin[0].container_definitions)[0].secrets : s if startswith(s.name, "WORK_")]) == 0
    error_message = "db-admin reads a Work bundle although work is not in db_bootstrap_products."
  }
}
