# Stage E blocker BE-1 (report 2026-11-14-identity-stage-e-blockers-remediation, file 01): what
# Terraform renders for each family Stage E runs equals envs/nonprod.stage-e-tasks.json, the manifest
# the guard connector script (scripts/aws/connector/e1-task-guard.py) validates live revisions
# against. Plan-only, mocked AWS provider, no credentials, no AWS call. The manifest is also checked
# against envs/nonprod.tfvars by scripts/aws/connector/test_task_guard.py.
#
#   terraform init -backend=false && terraform test -filter=tests/stage-e-manifest.tftest.hcl

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



run "stage_e_task_definitions_match_the_manifest" {
  command = plan

  override_resource {
    target          = aws_db_instance.main
    override_during = plan
    values = {
      # The live Testing endpoint (a DNS name, not a secret; report 2026-11-09-identity-config-a1-
      # preparation): the manifest pins PGHOST to it (owner review B-1).
      address            = "munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-0d1c2b3a-4f5e-4d7c-8b9a-0f1e2d3c4b5a-AbCdEf", kms_key_id = "mock", secret_status = "active" }]
    }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-Ab12Cd" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-migrate-Ef34Gh" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["work-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-migrate-Ij56Kl" }
  }
  override_resource {
    target          = aws_iam_role.db_admin_execution
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-db-admin-execution" }
  }
  override_resource {
    target          = aws_iam_role.identity_bootstrap_execution[0]
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution" }
  }
  # The execution policy's other resources, so its JSON is known at plan time (L-A0 asserts below).
  override_resource {
    target          = aws_kms_key.data
    override_during = plan
    values          = { arn = "arn:aws:kms:eu-central-1:229251310592:key/45eda044-092a-4f31-9243-3f9548636e37" }
  }
  override_resource {
    target          = aws_cloudwatch_log_group.ops
    override_during = plan
    values          = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/ops" }
  }

  variables {
    # envs/nonprod.tfvars' values for everything a Stage E environment value comes from, so the
    # rendered values can be compared with the manifest's (owner review B-1; test_task_guard.py checks
    # the manifest against envs/nonprod.tfvars).
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator-test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
    }
    identity_signing_kid = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity"].containers.identity.environment.IDENTITY_SIGNING_KID
    identity_public_keys = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-probe"].containers["identity-probe"].environment.PROBE_PUBLIC_KEYS
    images = {
      identity_api     = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity"].containers.identity.image
      identity_migrate = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-migrate"].containers["identity-migrate"].image
      work_migrate     = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers["work-migrate"].image
    }
    postgres_image        = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-db-admin"].containers["db-admin"].image
    valkey_image          = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity"].containers.valkey.image
    db_bootstrap_products = ["identity"]
    secret_version_ids = {
      identity         = "80914756-68cd-420d-8094-0fd49afe3492"
      identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
      work-migrate     = jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers["work-migrate"].secrets.DATABASE_MIGRATION_URL.version
    }
    identity_security_config = {
      mfa_primary_kid      = "mfa-nonprod-2026-11"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
    }
    identity_probe_source = {
      commit = "0123456789abcdef0123456789abcdef01234567"
      sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  }

  # Every family, every container: the names, the image digests, the secret names, and each secret's
  # reference in the exact form the guard accepts (bundle ARN with its 6-character suffix, key and
  # pinned version; the one-run secret's partial ARN; the RDS master secret's username/password).
  assert {
    condition = alltrue(flatten([
      for family, cd in {
        "munaxa-nonprod-db-admin"           = aws_ecs_task_definition.db_admin[0].container_definitions
        "munaxa-nonprod-identity-migrate"   = module.migrate["identity"].task_definition_container_definitions
        "munaxa-nonprod-identity-bootstrap" = aws_ecs_task_definition.identity_bootstrap[0].container_definitions
        "munaxa-nonprod-identity-probe"     = aws_ecs_task_definition.identity_probe[0].container_definitions
        "munaxa-nonprod-identity"           = module.identity[0].task_definition_container_definitions
        "munaxa-nonprod-work-migrate"       = module.migrate["work"].task_definition_container_definitions
        } : concat(
        [sort([for c in jsondecode(cd) : c.name]) == sort(keys(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers))],
        [for c in jsondecode(cd) : c.image == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].image],
        [for c in jsondecode(cd) : sort([for s in c.secrets : s.name]) == sort(keys(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets))],
        flatten([for c in jsondecode(cd) : [for s in c.secrets : can(regex(
          jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].form == "full" ? format(
            "^arn:aws:secretsmanager:eu-central-1:229251310592:secret:%s-[A-Za-z0-9]{6}:%s::%s$",
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].secret,
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].key,
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].version,
            ) : jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].form == "partial" ? format(
            "^arn:aws:secretsmanager:eu-central-1:229251310592:secret:%s:%s::$",
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].secret,
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].key,
            ) : format(
            "^arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-[0-9a-f-]{36}-[A-Za-z0-9]{6}:%s::$",
            jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].secrets[s.name].key,
          ),
        s.valueFrom))]]),
      )
    ]))
    error_message = "A Stage E task definition differs from envs/nonprod.stage-e-tasks.json (containers, images, secret names or references)."
  }

  assert {
    condition = (
      aws_ecs_task_definition.db_admin[0].family == "munaxa-nonprod-db-admin" &&
      aws_ecs_task_definition.identity_bootstrap[0].family == "munaxa-nonprod-identity-bootstrap" &&
      aws_ecs_task_definition.identity_probe[0].family == "munaxa-nonprod-identity-probe"
    )
    error_message = "The manifest's run-only family names are the ones Terraform registers (the two module families are <prefix>-<name>, modules/service local.id)."
  }

  # L-A0 redesign (owner decision D-LA0, report 2026-11-15-identity-stage-e-owner-decisions, file 03):
  # the bootstrap reads the persistent operator secret that Secrets Manager generated, there is no
  # one-run identity-bootstrap copy, and the execution role can read nothing else of the operator's.
  assert {
    condition = (
      toset([for s in jsondecode(aws_ecs_task_definition.identity_bootstrap[0].container_definitions)[0].secrets : s.valueFrom if startswith(s.name, "IDENTITY_OWNER_")]) == toset([
        "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-operator:IDENTITY_OWNER_EMAIL::",
        "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-operator:IDENTITY_OWNER_PASSWORD::",
      ]) &&
      length(jsondecode(aws_ecs_task_definition.identity_bootstrap[0].container_definitions)[0].secrets) == 3 &&
      !strcontains(aws_ecs_task_definition.identity_bootstrap[0].container_definitions, "identity-bootstrap:") &&
      !strcontains(aws_ecs_task_definition.identity_probe[0].container_definitions, "identity-operator")
    )
    error_message = "L-A0: identity-bootstrap reads IDENTITY_OWNER_* from munaxa-nonprod/identity-operator only, and the probe never names identity-operator."
  }

  assert {
    condition = (
      one([for s in jsondecode(aws_iam_role_policy.identity_bootstrap_execution[0].policy).Statement : s if s.Action == "secretsmanager:GetSecretValue"]).Resource == [
        aws_secretsmanager_secret.service["identity-migrate"].arn,
        "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-operator-??????",
      ] &&
      !strcontains(aws_iam_role_policy.identity_bootstrap_execution[0].policy, "identity-bootstrap-") &&
      length([for s in jsondecode(aws_iam_role_policy.identity_bootstrap_execution[0].policy).Statement : s if strcontains(jsonencode(s.Action), "secretsmanager")]) == 1
    )
    error_message = "L-A0: the identity-bootstrap execution role reads only the identity-migrate bundle and the operator secret (exact, ?????? suffix), never the legacy one-run secret."
  }

  assert {
    condition = (
      endswith(aws_ecs_task_definition.db_admin[0].execution_role_arn, ":role/munaxa-shared/${jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-db-admin"].executionRole}") &&
      endswith(aws_ecs_task_definition.identity_bootstrap[0].execution_role_arn, ":role/munaxa-shared/${jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-bootstrap"].executionRole}") &&
      endswith(aws_ecs_task_definition.identity_probe[0].execution_role_arn, ":role/munaxa-shared/${jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-probe"].executionRole}") &&
      aws_security_group.db_admin.name == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-db-admin"].securityGroup
    )
    error_message = "The manifest's execution roles and the db-admin group are the ones Terraform gives the run-only families."
  }

  # Review findings S-2 and C-4 (report file 06): the guard also compares each container's exact
  # environment names, its shape fields (manifest shapeKeys) and its command; these are what
  # Terraform renders, and a container has no shape field the manifest does not list.
  assert {
    condition = alltrue(flatten([
      for family, cd in {
        "munaxa-nonprod-db-admin"           = aws_ecs_task_definition.db_admin[0].container_definitions
        "munaxa-nonprod-identity-migrate"   = module.migrate["identity"].task_definition_container_definitions
        "munaxa-nonprod-identity-bootstrap" = aws_ecs_task_definition.identity_bootstrap[0].container_definitions
        "munaxa-nonprod-identity-probe"     = aws_ecs_task_definition.identity_probe[0].container_definitions
        "munaxa-nonprod-identity"           = module.identity[0].task_definition_container_definitions
        "munaxa-nonprod-work-migrate"       = module.migrate["work"].task_definition_container_definitions
        } : [for c in jsondecode(cd) : concat(
          [jsonencode(sort([for e in try(c.environment, []) : e.name])) == jsonencode(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].environmentNames)],
          [for k in jsondecode(file("envs/nonprod.stage-e-tasks.json")).shapeKeys : contains(keys(c), k) == contains(keys(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].shape), k)],
          [for k, v in jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].shape : c[k] == v],
          # Owner review B-1: every value, except the probe pin's two (compared with probePin by the guard).
          [for e in try(c.environment, []) : contains(["PROBE_COMMIT", "PROBE_SHA256"], e.name) || try(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].environment[e.name] == e.value, false)],
          # Owner review B-8: any other container field is one the manifest lists under "extra".
          [jsonencode({ for k, v in c : k => v if !contains(concat(["name", "image", "secrets", "environment", "command"], jsondecode(file("envs/nonprod.stage-e-tasks.json")).shapeKeys), k) && v != false }) == jsonencode(try(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].extra, {}))],
          [
            can(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].command) ? c.command == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].command :
            can(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].commandSha256) ? length(c.command) == 1 && sha256(c.command[0]) == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].commandSha256 :
            try(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].containers[c.name].probeLoader, false) ? c.command == ["node", "--input-type=module", "-e", replace(replace(file("scripts/identity-probe-loader.mjs"), "__PROBE_COMMIT__", var.identity_probe_source.commit), "__PROBE_SHA256__", var.identity_probe_source.sha256)] :
            !contains(keys(c), "command")
          ],
      )]
    ]))
    error_message = "A Stage E container's environment names or values, shape fields, other fields or command differ from envs/nonprod.stage-e-tasks.json."
  }

  # Owner review B-8: the task's cpu, memory and runtime platform are the manifest's "task".
  assert {
    condition = alltrue([
      for family, t in {
        "munaxa-nonprod-db-admin"           = { cpu = aws_ecs_task_definition.db_admin[0].cpu, memory = aws_ecs_task_definition.db_admin[0].memory, arch = aws_ecs_task_definition.db_admin[0].runtime_platform[0].cpu_architecture, os = aws_ecs_task_definition.db_admin[0].runtime_platform[0].operating_system_family }
        "munaxa-nonprod-identity-bootstrap" = { cpu = aws_ecs_task_definition.identity_bootstrap[0].cpu, memory = aws_ecs_task_definition.identity_bootstrap[0].memory, arch = aws_ecs_task_definition.identity_bootstrap[0].runtime_platform[0].cpu_architecture, os = aws_ecs_task_definition.identity_bootstrap[0].runtime_platform[0].operating_system_family }
        "munaxa-nonprod-identity-probe"     = { cpu = aws_ecs_task_definition.identity_probe[0].cpu, memory = aws_ecs_task_definition.identity_probe[0].memory, arch = aws_ecs_task_definition.identity_probe[0].runtime_platform[0].cpu_architecture, os = aws_ecs_task_definition.identity_probe[0].runtime_platform[0].operating_system_family }
        "munaxa-nonprod-identity-migrate"   = { cpu = module.migrate["identity"].task_definition_size.cpu, memory = module.migrate["identity"].task_definition_size.memory, arch = module.migrate["identity"].task_definition_size.cpu_architecture, os = module.migrate["identity"].task_definition_size.operating_system_family }
        "munaxa-nonprod-identity"           = { cpu = module.identity[0].task_definition_size.cpu, memory = module.identity[0].task_definition_size.memory, arch = module.identity[0].task_definition_size.cpu_architecture, os = module.identity[0].task_definition_size.operating_system_family }
      } : tostring(t.cpu) == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].task.cpu &&
      tostring(t.memory) == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].task.memory &&
      t.arch == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].task.runtimePlatform.cpuArchitecture &&
      t.os == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families[family].task.runtimePlatform.operatingSystemFamily
    ])
    error_message = "A Stage E task's cpu, memory or runtime platform differs from envs/nonprod.stage-e-tasks.json."
  }

  assert {
    condition = (
      sha256(file("scripts/identity-probe-loader.mjs")) == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-probe"].loaderSha256 &&
      sha256(file("scripts/db-bootstrap.sh")) == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-db-admin"].containers["db-admin"].commandSha256 &&
      [for v in aws_ecs_task_definition.identity_probe[0].volume : v.name] == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-identity-probe"].volumes &&
      length(aws_ecs_task_definition.db_admin[0].volume) == 0 && length(aws_ecs_task_definition.identity_bootstrap[0].volume) == 0 &&
      aws_ecs_task_definition.identity_probe[0].pid_mode == null
    )
    error_message = "The manifest's loader and db-admin hashes, and the task volumes, are what Terraform registers."
  }
}

# MW-005: work-migrate joins E-1 as a pending family (no Work image or work-migrate version is pinned
# yet). What Terraform renders for it, given a synthetic pin, must already equal the manifest in
# everything but those two pins: the container, the environment names AND values (PLATFORM_AUTH_ISSUER,
# which Work's bootstrap compares its --issuer with), the secret and its reference form, the shape the
# guard compares, no command, and the task's size. The pin PR then only fills the image and version.
run "work_migrate_renders_the_pending_manifest_family" {
  command = plan

  override_resource {
    target          = aws_secretsmanager_secret.service["work-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-migrate-Wk56Mg" }
  }

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator-test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
    }
    images = {
      work_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:0a1b2c3d0a1b2c3d0a1b2c3d0a1b2c3d0a1b2c3d0a1b2c3d0a1b2c3d0a1b2c3d"
    }
    secret_version_ids = {
      work-migrate = "11111111-2222-4333-8444-555555555555"
    }
  }

  assert {
    condition = (
      [for c in jsondecode(module.migrate["work"].task_definition_container_definitions) : c.name] == keys(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers)
      && { for e in jsondecode(module.migrate["work"].task_definition_container_definitions)[0].environment : e.name => e.value } == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers["work-migrate"].environment
      && sort([for e in jsondecode(module.migrate["work"].task_definition_container_definitions)[0].environment : e.name]) == sort(jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers["work-migrate"].environmentNames)
    )
    error_message = "work-migrate's rendered container or environment (names and values, PLATFORM_AUTH_ISSUER included) differs from envs/nonprod.stage-e-tasks.json."
  }

  assert {
    condition = (
      [for s in jsondecode(module.migrate["work"].task_definition_container_definitions)[0].secrets : s.name] == ["DATABASE_MIGRATION_URL"]
      && can(regex("^arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/work-migrate-[A-Za-z0-9]{6}:DATABASE_MIGRATION_URL::11111111-2222-4333-8444-555555555555$", jsondecode(module.migrate["work"].task_definition_container_definitions)[0].secrets[0].valueFrom))
      && jsondecode(module.migrate["work"].task_definition_container_definitions)[0].image == var.images.work_migrate
    )
    error_message = "work-migrate's rendered secret reference or image is not in the form the E-1 guard accepts."
  }

  assert {
    condition = (
      jsondecode(module.migrate["work"].task_definition_container_definitions)[0].logConfiguration == jsondecode(file("envs/nonprod.stage-e-tasks.json")).families["munaxa-nonprod-work-migrate"].containers["work-migrate"].shape.logConfiguration
      && jsondecode(module.migrate["work"].task_definition_container_definitions)[0].linuxParameters.capabilities.drop == ["ALL"]
      && jsondecode(module.migrate["work"].task_definition_container_definitions)[0].readonlyRootFilesystem == false
      && try(jsondecode(module.migrate["work"].task_definition_container_definitions)[0].command, null) == null
    )
    error_message = "work-migrate's rendered shape (log configuration, capabilities, root filesystem, command) differs from envs/nonprod.stage-e-tasks.json."
  }
}
