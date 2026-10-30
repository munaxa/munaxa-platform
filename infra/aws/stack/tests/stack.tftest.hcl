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
    operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
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
  assert {
    condition     = local.operator_open && local.operator_access_environment.OPERATOR_ACCESS_AUDIENCE == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" && local.operator_access_environment.OPERATOR_ACCESS_TEAM_DOMAIN == "https://munaxa-test.cloudflareaccess.com"
    error_message = "With Cloudflare Access the operator host opens and Control's API and portal get its team domain and AUD tag."
  }
  assert {
    condition = (
      !contains(local.licence_policy.Statement[0].Action, "kms:Sign") &&
      !contains(local.licence_policy.Statement[0].Action, "kms:CreateGrant") &&
      !contains(local.licence_policy.Statement[0].Action, "kms:*") &&
      contains(local.licence_policy.Statement[0].Action, "kms:PutKeyPolicy")
    )
    error_message = "The account administers the licence key, keeps PutKeyPolicy for recovery, and cannot sign or grant."
  }
  assert {
    condition = (
      local.licence_policy.Statement[1].Principal.AWS == "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-test-control-api-task" &&
      local.licence_policy.Statement[1].Action == "kms:Sign" &&
      local.licence_policy.Statement[1].Condition.StringEquals["kms:SigningAlgorithm"] == "ECDSA_SHA_256" &&
      local.licence_policy.Statement[1].Condition.StringEquals["kms:MessageType"] == "DIGEST"
    )
    error_message = "Only the control-api task role signs, and only ES256 digests."
  }
  assert {
    condition = (
      local.licence_policy.Statement[2].Effect == "Deny" && local.licence_policy.Statement[2].Action == "kms:Sign" &&
      local.licence_policy.Statement[2].Condition.ArnNotEquals["aws:PrincipalArn"] == "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-test-control-api-task" &&
      local.licence_policy.Statement[3].Effect == "Deny" && local.licence_policy.Statement[3].Action == "kms:CreateGrant"
    )
    error_message = "Every other principal is refused kms:Sign, and nobody may create a grant."
  }
  assert {
    condition     = length(local.licence_policy.Statement) == 4
    error_message = "The licence key policy holds exactly the four statements reviewed."
  }
}

run "the_operator_host_stays_closed_without_access_or_ranges" {
  command = plan
  variables {
    edge_enabled     = true
    services_enabled = true
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }
  assert {
    condition     = !local.operator_open && aws_lb_listener_rule.operator_refused[0].priority == 39
    error_message = "With neither Access nor ranges the operator host is not routed, and rule 39 refuses it."
  }
}

run "operator_ranges_alone_open_the_host" {
  command = plan
  variables {
    operator_cidrs = ["203.0.113.0/24"]
  }
  assert {
    condition     = local.operator_open && length(local.operator_access_environment) == 0
    error_message = "Operator ranges open the host without Access settings."
  }
}

run "control_without_cloudflare_access_is_refused" {
  command = plan
  variables {
    images = {
      control_portal = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
  }
  expect_failures = [var.operator_access]
}

run "a_malformed_access_setting_is_refused" {
  command = plan
  variables {
    operator_access = { team_domain = "https://munaxa.example.com", audience = "short" }
  }
  expect_failures = [var.operator_access]
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

run "more_operator_ranges_than_an_alb_rule_holds_are_refused" {
  command = plan
  variables {
    operator_cidrs = ["198.51.100.0/26", "198.51.100.64/26", "198.51.100.128/26", "198.51.100.192/26"]
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

run "docs_runs_in_a_session_with_its_bucket_bundles_and_tasks" {
  command = plan

  variables {
    edge_enabled     = true
    services_enabled = true
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator.test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    postgres_image   = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
    }
  }

  assert {
    condition     = length(module.docs_api) == 1 && length(module.docs_web) == 1 && length(module.docs_scanner) == 1
    error_message = "Docs runs its API, web and scanner in a session."
  }
  assert {
    condition     = length(aws_secretsmanager_secret.service) == 10 && contains(keys(aws_secretsmanager_secret.service), "docs-operator")
    error_message = "Docs gets its app and operator bundles."
  }
  assert {
    condition     = length(aws_s3_bucket.files) == 2 && aws_s3_bucket.files["docs"].bucket == "munaxa-nonprod-docs-files-229251310592"
    error_message = "Docs gets its own bucket, never a munaxa-docs* name."
  }
  assert {
    condition     = length(aws_ecs_task_definition.docs_db_admin) == 1 && length(aws_ecs_task_definition.docs_provision) == 1
    error_message = "The Docs database bootstrap and provisioning tasks are registered."
  }
  assert {
    condition     = strcontains(aws_vpc_endpoint.s3.policy, "munaxa-nonprod-docs-files-229251310592") && strcontains(aws_vpc_endpoint.s3.policy, "munaxa-nonprod-school-files-229251310592")
    error_message = "The S3 gateway endpoint admits both file buckets."
  }
}

run "without_a_docs_host_there_is_no_docs" {
  command = plan

  assert {
    condition     = length(module.docs_api) == 0 && length(aws_s3_bucket.files) == 1 && length(aws_iam_role.docs_db_admin_execution) == 0
    error_message = "Docs exists only where hosts.docs is set (not in prod)."
  }
}

run "the_control_api_host_forwards_only_its_public_surface" {
  command = plan

  variables {
    edge_enabled     = true
    services_enabled = true
    operator_access  = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    images = {
      control_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }

  assert {
    condition     = length(aws_lb_listener_rule.control_api_refused) == 1 && aws_lb_listener_rule.control_api_refused[0].priority == 21
    error_message = "Anything the allow rule does not forward on the Control API host is refused, in any case."
  }
  assert {
    condition     = length(module.control_api[0].listener_rule_paths["20"]) == 3 && !contains(module.control_api[0].listener_rule_paths["20"], "/*")
    error_message = "The Control API host forwards only /api/v1/products/*, /api/v1/licensing/* and /health/*."
  }
}
