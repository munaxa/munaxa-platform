# MW-075: the Work host forwards GET /health/ready, and nothing else new, to work-api (rule 49), so
# the smoke test can read work-api readiness from outside. Plan only, mocked AWS provider, no
# credentials, no AWS call. Every value is a public placeholder.
#
#   terraform init -backend=false && terraform test -filter=tests/work-readiness-route.tftest.hcl

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

  # Every product of a full session, so the other hosts' rules can be compared.
  operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  db_bootstrap_products = ["identity", "control", "work", "school"]
  images = {
    identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"
    control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    work_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    work_admin       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    work_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/migrate@sha256:fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe"
    school_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-school/api@sha256:0000000000000000000000000000000000000000000000000000000000000000"
    school_admin     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-school/admin@sha256:0000000000000000000000000000000000000000000000000000000000000001"
    school_migrate   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-school/migrate@sha256:0000000000000000000000000000000000000000000000000000000000000002"
  }
}
run "a_session_forwards_get_health_ready_on_the_work_host_to_work_api" {
  command = plan

  variables {
    edge_enabled     = true
    services_enabled = true
  }

  assert {
    condition     = join(",", module.work_api[0].listener_rule_priorities) == "49,51"
    error_message = "work-api has exactly two rules in a session: 49 (readiness) and 51 (/api/v1/*)."
  }
  assert {
    condition = (
      join(",", module.work_api[0].listener_rule_paths["49"]) == "/health/ready"
      && join(",", module.work_api[0].listener_rule_methods["49"]) == "GET"
    )
    error_message = "Rule 49 forwards the exact path /health/ready, GET only; /health and /health/live stay unrouted."
  }
  assert {
    condition     = join(",", module.work_api[0].listener_rule_hosts["49"]) == "work.test.munaxa.com" && join(",", module.work_api[0].listener_rule_hosts["51"]) == "work.test.munaxa.com"
    error_message = "Rules 49 and 51 render the work host, and only it."
  }
  assert {
    condition = (
      join(",", module.work_api[0].listener_rule_paths["51"]) == "/api/v1/*"
      && length(module.work_api[0].listener_rule_methods["51"]) == 0
    )
    error_message = "Rule 51 is unchanged: /api/v1/* on the work host, any method."
  }
}

run "the_other_hosts_keep_their_rules" {
  command = plan

  variables {
    edge_enabled     = true
    services_enabled = true
  }

  assert {
    condition     = join(",", module.work_admin[0].listener_rule_priorities) == "52" && length(module.work_admin[0].listener_rule_paths["52"]) == 0
    error_message = "work-admin keeps rule 52, the rest of the work host."
  }
  assert {
    condition     = join(",", module.identity[0].listener_rule_priorities) == "30,40,50"
    error_message = "Identity keeps rules 30, 40 and 50."
  }
  assert {
    condition     = join(",", module.control_api[0].listener_rule_priorities) == "20" && join(",", module.control_portal[0].listener_rule_priorities) == "31"
    error_message = "Control keeps rules 20 and 31."
  }
  assert {
    condition     = join(",", module.school_api[0].listener_rule_priorities) == "60" && join(",", module.school_admin[0].listener_rule_priorities) == "61"
    error_message = "School keeps rules 60 and 61."
  }
  assert {
    condition = alltrue([
      for m in [module.identity[0], module.control_api[0], module.control_portal[0], module.work_admin[0], module.school_api[0], module.school_admin[0]] :
      alltrue([for methods in values(m.listener_rule_methods) : length(methods) == 0])
    ])
    error_message = "No other rule gains a method condition."
  }
}

run "without_services_there_is_no_work_rule" {
  command = plan

  variables {
    edge_enabled     = true
    services_enabled = false
  }

  assert {
    condition     = length(module.work_api[0].listener_rule_priorities) == 0 && length(module.work_admin[0].listener_rule_priorities) == 0
    error_message = "No Work listener rule exists while the Work services do not (the Work pin applies with services off)."
  }
}

run "without_the_edge_there_is_no_work_rule" {
  command = plan

  variables {
    edge_enabled     = false
    services_enabled = false
  }

  assert {
    condition     = length(module.work_api[0].listener_rule_priorities) == 0
    error_message = "No listener rule exists without the ALB."
  }
}
