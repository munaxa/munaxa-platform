# L-5 (report 2026-11-12-docs-migration-security-hardening): the docs-migrate bundle, which holds
# the owner credential, follows hosts.docs, not the Docs images. Applied runs against a mocked AWS
# provider (no credentials, no AWS call), in order, so each run starts from the state the previous
# one left: the transitions an operator makes, and what each one creates or deletes.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/mock-AbCdEf" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-00000000da7a" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/mock" }
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
    docs        = "docs.test.munaxa.com"
  }
  certificate_domains = ["*.test.munaxa.com"]
  postgres_image      = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  docs_redis_image    = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
}

# Docs hosted, no Docs image yet (nonprod today): every Docs bundle exists, docs-migrate included,
# so the owner can write the owner URL before any image is pinned. No Docs task is registered.
run "docs_host_only_creates_every_docs_bundle_and_no_task" {
  command = apply

  assert {
    condition     = alltrue([for k in ["docs-api", "docs-operator", "docs-migrate"] : contains(keys(aws_secretsmanager_secret.service), k)])
    error_message = "With hosts.docs set, the docs-api, docs-operator and docs-migrate bundles all exist."
  }
  assert {
    condition     = length(module.docs_migrate) == 0 && length(aws_ecs_task_definition.docs_db_admin) == 0 && length(module.docs_api) == 0
    error_message = "No Docs task definition before every Docs image is set."
  }
  assert {
    condition     = strcontains(aws_iam_role_policy.docs_db_admin_execution[0].policy, aws_secretsmanager_secret.service["docs-migrate"].arn)
    error_message = "docs-db-admin's execution role may read the owner URL from docs-migrate."
  }
}

# Enabling Docs (every image pinned) registers docs-migrate and docs-db-admin against the bundle that
# already exists: the secret references and task configuration appear together, nothing is replaced.
run "pinning_the_docs_images_registers_the_tasks_against_the_same_bundle" {
  command = apply

  variables {
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
      docs_migrate   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:7777777777777777777777777777777777777777777777777777777777777777"
    }
  }

  assert {
    condition     = length(module.docs_migrate) == 1 && length(aws_ecs_task_definition.docs_db_admin) == 1
    error_message = "With every Docs image set, docs-migrate and docs-db-admin are registered."
  }
  assert {
    condition = (
      strcontains(module.docs_migrate[0].task_definition_container_definitions, "${aws_secretsmanager_secret.service["docs-migrate"].arn}:DATABASE_MIGRATION_URL::") &&
      strcontains(aws_ecs_task_definition.docs_db_admin[0].container_definitions, "${aws_secretsmanager_secret.service["docs-migrate"].arn}:DATABASE_MIGRATION_URL::")
    )
    error_message = "Both tasks reference DATABASE_MIGRATION_URL in the one docs-migrate bundle."
  }
}

# Clearing an image (a rollback of the pin, or a typo) unregisters the tasks and keeps the bundle:
# the owner credential is never scheduled for deletion by an image change (the L-5 failure).
run "clearing_a_docs_image_keeps_the_owner_credential" {
  command = apply

  variables {
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
    }
  }

  assert {
    condition     = contains(keys(aws_secretsmanager_secret.service), "docs-migrate") && length(module.docs_migrate) == 0
    error_message = "Without images.docs_migrate the task goes, the docs-migrate bundle stays."
  }
}

# Removing the Docs host removes every Docs bundle and role: nothing migration-only is left behind.
run "removing_the_docs_host_leaves_no_docs_secret_behind" {
  command = apply

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator.test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
    }
  }

  assert {
    condition     = length([for k in keys(aws_secretsmanager_secret.service) : k if startswith(k, "docs")]) == 0
    error_message = "Without hosts.docs there is no docs-api, docs-operator or docs-migrate bundle."
  }
  assert {
    condition     = length(aws_iam_role.docs_db_admin_execution) == 0 && length(module.docs_migrate) == 0
    error_message = "No Docs role or task remains."
  }
}
