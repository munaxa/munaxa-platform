# Plan-only tests with a mocked AWS provider: no credentials, no AWS call. They check the shape of
# each stage and that the guardrails refuse what they must.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  # Policy documents are rendered by the provider; the mock returns a fixed, valid one.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
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
}

run "idle_testing_has_no_edge_and_no_services" {
  command = plan

  assert {
    condition     = length(aws_lb.main) == 0 && length(aws_lb_listener.https) == 0
    error_message = "The ALB must not exist between Testing sessions."
  }
  assert {
    condition     = length(module.identity) == 0 && length(module.work_api) == 0
    error_message = "No service is defined without an image."
  }
  assert {
    condition     = aws_db_instance.main.publicly_accessible == false && aws_db_instance.main.storage_encrypted
    error_message = "The database is private and encrypted."
  }
  assert {
    condition     = length(aws_secretsmanager_secret.service) == 8
    error_message = "One bundle per service and per migration job."
  }
}

run "session_runs_every_service_behind_the_edge" {
  command = plan

  variables {
    edge_enabled          = true
    services_enabled      = true
    operator_cidrs        = ["203.0.113.0/24"]
    valkey_image          = "public.ecr.aws/docker/library/valkey@sha256:1111111111111111111111111111111111111111111111111111111111111111"
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

  assert {
    condition     = length(aws_lb.main) == 1 && aws_lb_listener.https[0].ssl_policy == "ELBSecurityPolicy-TLS13-1-2-2021-06"
    error_message = "A session has one ALB with a TLS 1.2+ policy."
  }
  assert {
    condition     = length(aws_vpc_security_group_egress_rule.alb_to_service) == 7
    error_message = "The ALB reaches the seven routed task groups, each on its own port."
  }
  assert {
    condition     = aws_lb_listener_rule.control_admin_refused[0].action[0].fixed_response[0].status_code == "403"
    error_message = "The Control admin API is refused on the products' host."
  }
  assert {
    condition     = aws_lb_listener_rule.operator_refused[0].priority == 39
    error_message = "The operator host refuses every request the allow-listed rules did not take."
  }
  assert {
    condition     = length(module.migrate) == 3 && length(module.control_migrate) == 1
    error_message = "Every product has a migration task."
  }
  assert {
    condition     = length(aws_kms_key.licence) == 1 && aws_kms_key.licence[0].customer_master_key_spec == "ECC_NIST_P256" && aws_kms_key.licence[0].key_usage == "SIGN_VERIFY"
    error_message = "Control signs with a P-256 KMS key."
  }
  assert {
    condition     = length(aws_ecs_task_definition.db_admin) == 1
    error_message = "The db-admin task is registered once its image is set."
  }
  assert {
    condition     = length(aws_scheduler_schedule.control_sweep) == 0
    error_message = "Testing runs no schedule."
  }
}

run "an_image_tag_is_refused" {
  command = plan
  variables {
    images = { work_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api:latest" }
  }
  expect_failures = [var.images]
}

run "the_whole_internet_is_not_an_operator_network" {
  command = plan
  variables {
    operator_cidrs = ["0.0.0.0/0"]
  }
  expect_failures = [var.operator_cidrs]
}

run "a_private_key_is_refused_where_public_keys_go" {
  command = plan
  variables {
    identity_public_keys = "[{\"kid\":\"k\",\"publicKey\":\"-----BEGIN PRIVATE KEY-----\"}]"
  }
  expect_failures = [var.identity_public_keys]
}

run "docs_production_network_is_not_reused" {
  command = plan
  variables {
    vpc_cidr = "10.121.0.0/16"
  }
  expect_failures = [var.vpc_cidr]
}
