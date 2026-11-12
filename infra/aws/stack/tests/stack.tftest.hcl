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
    condition     = length(aws_ecs_task_definition.identity_bootstrap) == 1 && length(aws_iam_role.identity_bootstrap_execution) == 1 && length(aws_ecs_task_definition.school_bootstrap) == 1
    error_message = "Identity's first-operator and School's first-owner tasks are registered."
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

run "the_api_image_is_refused_as_the_docs_migration_image" {
  command = plan
  variables {
    images = { docs_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:7777777777777777777777777777777777777777777777777777777777777777" }
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
      docs_migrate   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:7777777777777777777777777777777777777777777777777777777777777777"
    }
  }

  assert {
    condition     = length(module.docs_api) == 1 && length(module.docs_web) == 1 && length(module.docs_scanner) == 1
    error_message = "Docs runs its API, web and scanner in a session."
  }
  assert {
    condition     = length(aws_secretsmanager_secret.service) == 11 && contains(keys(aws_secretsmanager_secret.service), "docs-operator") && contains(keys(aws_secretsmanager_secret.service), "docs-migrate")
    error_message = "Docs gets its app, operator and migration bundles."
  }
  assert {
    condition     = length(module.docs_migrate) == 1 && module.docs_migrate[0].service_name == null
    error_message = "docs-migrate is registered as a one-off task definition, never a service, even in a session."
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
    condition     = length(module.docs_api) == 0 && length(module.docs_migrate) == 0 && length(aws_s3_bucket.files) == 1 && length(aws_iam_role.docs_db_admin_execution) == 0
    error_message = "Docs exists only where hosts.docs is set (not in prod)."
  }
  assert {
    condition     = length([for k in keys(aws_secretsmanager_secret.service) : k if startswith(k, "docs")]) == 0
    error_message = "L-5: without hosts.docs there is no Docs bundle at all, docs-migrate included: nothing migration-only is left behind."
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

# Phase 6 (Agent 5): the AWS-side backstop stops Testing without GitHub, and only Testing.
run "nonprod_has_an_aws_side_backstop" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
  }

  assert {
    condition     = length(aws_scheduler_schedule.stop_database) == 1 && length(aws_scheduler_schedule.scale_in) == 10
    error_message = "Nonprod stops its database and scales in every service from EventBridge Scheduler."
  }
  assert {
    condition     = aws_scheduler_schedule.stop_database[0].target[0].arn == "arn:aws:scheduler:::aws-sdk:rds:stopDBInstance" && jsondecode(aws_scheduler_schedule.stop_database[0].target[0].input).DbInstanceIdentifier == "munaxa-nonprod-pg"
    error_message = "The database schedule calls rds:StopDBInstance on munaxa-nonprod-pg."
  }
  assert {
    condition = alltrue([for k, s in aws_scheduler_schedule.scale_in :
      s.target[0].arn == "arn:aws:scheduler:::aws-sdk:ecs:updateService" && jsondecode(s.target[0].input).DesiredCount == 0 && jsondecode(s.target[0].input).Cluster == "munaxa-nonprod"
    ])
    error_message = "Every service schedule sets desired count 0 in the nonprod cluster."
  }
  assert {
    condition     = aws_iam_role.session_backstop[0].permissions_boundary == "arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary" && aws_scheduler_schedule.stop_database[0].schedule_expression_timezone == "UTC"
    error_message = "The backstop role carries the nonprod workload boundary; schedules run in UTC."
  }
}

# The policy names the database and cluster ARNs; give them values at plan time.
run "the_backstop_role_can_only_stop_and_scale_in" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
  }

  override_resource {
    target          = aws_db_instance.main
    override_during = plan
    values = {
      arn                = "arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"
      identifier         = "munaxa-nonprod-pg"
      address            = "munaxa-nonprod-pg.example.eu-central-1.rds.amazonaws.com"
      port               = 5432
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock", kms_key_id = "mock", secret_status = "active" }]
    }
  }
  override_resource {
    target          = aws_ecs_cluster.main
    override_during = plan
    values          = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" }
  }
  override_resource {
    target          = aws_iam_role.session_backstop[0]
    override_during = plan
    values          = { id = "munaxa-nonprod-session-backstop", arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-backstop" }
  }

  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement :
      s.Effect == "Allow" && contains(["rds:StopDBInstance", "ecs:UpdateService"], s.Action)
    ])
    error_message = "The backstop role can only stop the database and update services."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement[0].Resource == "arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg" && jsondecode(aws_iam_role_policy.session_backstop[0].policy).Statement[1].Resource == "arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*"
    error_message = "Only the nonprod database and the nonprod cluster's services."
  }
}

# D-4 = B (phase 7): the backstop is off unless the separate post-G3 apply sets the schedule.
run "an_empty_schedule_turns_the_backstop_off" {
  command = plan

  variables {
    session_backstop_schedule = ""
  }

  assert {
    condition     = length(aws_scheduler_schedule.stop_database) == 0 && length(aws_scheduler_schedule.scale_in) == 0 && length(aws_iam_role.session_backstop) == 0
    error_message = "An empty schedule turns the backstop off."
  }
}

# Nonprod readiness (6 Nov 2026): the backstop's AWS-side inputs, checked before the apply. The G3
# recovery showed that a mocked plan misses what AWS validates only on the call (an EC2 description
# character, a tag-less AWS managed key). Scheduler validates names and descriptions at creation and
# the target input never (it fails on every run), so these pin what can be pinned offline: the
# documented CreateSchedule and RetryPolicy constraints, the exact target input keys, and that every
# service the nonprod environment runs is covered.
run "the_backstop_schedules_fit_what_scheduler_accepts" {
  command = plan

  variables {
    session_backstop_schedule = "cron(0 21 * * ? *)"
    # envs/nonprod.tfvars desired_counts: every service Testing can run, Docs included.
    desired_counts = {
      identity   = 1, control-api = 1, control-portal = 1, work-api = 1, work-admin = 1,
      school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1,
    }
  }

  assert {
    condition     = length(setsubtract(keys(var.desired_counts), keys(aws_scheduler_schedule.scale_in))) == 0
    error_message = "Every service nonprod can run has a scale-in schedule."
  }
  assert {
    condition = alltrue([for s in concat(values(aws_scheduler_schedule.scale_in), aws_scheduler_schedule.stop_database) :
      length(s.name) <= 64 && can(regex("^[0-9a-zA-Z_.-]+$", s.name)) && startswith(s.name, "munaxa-nonprod-backstop-")
    ])
    error_message = "Schedule names: at most 64 of [0-9a-zA-Z-_.] (CreateSchedule), and inside the deployer's munaxa-nonprod-* allow."
  }
  assert {
    condition = alltrue([for s in concat(values(aws_scheduler_schedule.scale_in), aws_scheduler_schedule.stop_database) :
      length(s.description) <= 512 && !strcontains(s.description, "\u2014") && !strcontains(s.description, "'")
    ])
    error_message = "Descriptions: at most 512 characters, no em dash, no apostrophe."
  }
  assert {
    condition = alltrue([for s in concat(values(aws_scheduler_schedule.scale_in), aws_scheduler_schedule.stop_database) :
      s.schedule_expression == "cron(0 21 * * ? *)" && s.schedule_expression_timezone == "UTC" && s.state != "DISABLED" &&
      s.flexible_time_window[0].mode == "OFF" &&
      s.target[0].retry_policy[0].maximum_retry_attempts >= 0 && s.target[0].retry_policy[0].maximum_retry_attempts <= 185 &&
      s.target[0].retry_policy[0].maximum_event_age_in_seconds >= 60 && s.target[0].retry_policy[0].maximum_event_age_in_seconds <= 86400
    ])
    error_message = "Every schedule: daily 21:00 UTC, never disabled, no flexible window, retry policy inside the RetryPolicy ranges."
  }
  assert {
    condition     = keys(jsondecode(aws_scheduler_schedule.stop_database[0].target[0].input)) == ["DbInstanceIdentifier"]
    error_message = "The database schedule's input holds the instance identifier and nothing else."
  }
  assert {
    condition = alltrue([for k, s in aws_scheduler_schedule.scale_in :
      keys(jsondecode(s.target[0].input)) == ["Cluster", "DesiredCount", "Service"] && jsondecode(s.target[0].input).Service == k
    ])
    error_message = "Each service schedule's input holds the cluster, its own service and desired count 0, nothing else."
  }
  assert {
    condition     = jsondecode(aws_iam_role.session_backstop[0].assume_role_policy).Statement[0].Principal.Service == "scheduler.amazonaws.com" && length(jsondecode(aws_iam_role.session_backstop[0].assume_role_policy).Statement) == 1 && jsondecode(aws_iam_role.session_backstop[0].assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "229251310592"
    error_message = "Only EventBridge Scheduler of this account can assume the backstop role."
  }
  assert {
    condition     = aws_iam_role.session_backstop[0].name == "munaxa-nonprod-session-backstop" && aws_iam_role.session_backstop[0].path == "/munaxa-shared/"
    error_message = "The backstop role's name and path are inside the deployer's role/munaxa-shared/munaxa-nonprod-* allow."
  }
}

run "identity_without_its_valkey_sidecar_is_refused_in_a_session" {
  command = plan
  variables {
    services_enabled = true
    valkey_image     = ""
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }
  expect_failures = [var.valkey_image]
}

run "identity_signing_kid_must_be_a_published_key" {
  command = plan
  variables {
    services_enabled     = true
    identity_signing_kid = "identity-other"
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }
  expect_failures = [var.identity_signing_kid]
}

run "control_in_a_session_needs_its_licence_key_and_operators" {
  command = plan
  variables {
    services_enabled           = true
    operator_access            = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    control_licence_public_key = ""
    images = {
      control_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }
  expect_failures = [var.control_licence_public_key]
}

run "control_images_with_services_off_create_the_licence_key_first" {
  command = plan
  variables {
    services_enabled           = false
    operator_access            = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    control_licence_public_key = ""
    control_licence_kid        = ""
    images = {
      control_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }
  assert {
    condition     = length(aws_kms_key.licence) == 1 && length(module.control_api) == 1
    error_message = "Step one of the Control bring-up: the licence key exists before any Control task runs."
  }
}

run "work_in_a_session_needs_identity_public_keys" {
  command = plan
  variables {
    services_enabled     = true
    identity_public_keys = "[]"
    images = {
      work_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    }
  }
  expect_failures = [var.identity_public_keys]
}

run "the_first_session_runs_control_at_zero_until_the_operator_ids_exist" {
  command = plan
  variables {
    services_enabled                 = true
    operator_access                  = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    control_operator_organisation_id = ""
    control_operator_subjects        = []
    desired_counts = {
      identity   = 1, control-api = 0, control-portal = 0, work-api = 1, work-admin = 1
      school-api = 1, school-admin = 1, docs-api = 1, docs-web = 1, docs-scanner = 1
    }
    images = {
      control_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }
  assert {
    condition     = length(module.control_api) == 1
    error_message = "control-api is defined and can run at zero tasks while the operator ids are pending."
  }
}

run "prod_never_gets_the_backstop" {
  command = plan

  variables {
    environment               = "prod"
    session_backstop_schedule = "cron(0 21 * * ? *)"
  }

  assert {
    condition     = length(aws_scheduler_schedule.stop_database) == 0 && length(aws_scheduler_schedule.scale_in) == 0 && length(aws_iam_role.session_backstop) == 0
    error_message = "Production never gets the Testing backstop, whatever the schedule says."
  }
}

# Config A1 (2026-11-09 report identity-config-a1-preparation): the first Testing deployment is
# Identity only, in an environment that sets hosts.docs. postgres_image is set for the products'
# db-admin, which must not also register Docs' db-admin task definition.
# DC-01: the Docs migration path (report 2026-11-11-docs-migration-path). docs-migrate is the
# munaxa-docs `migrate` image as a one-off task: its own execution role, log group and security
# group; DATABASE_MIGRATION_URL only through ECS secrets from <env>/docs-migrate; no task role.
run "docs_migrate_runs_the_migration_image_with_only_its_owner_url" {
  command = plan

  override_resource {
    target          = aws_secretsmanager_secret.service["docs-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["docs-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-api-GhIjKl" }
  }
  override_resource {
    target          = module.docs_migrate[0].aws_iam_role.execution
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-docs-migrate-execution" }
  }
  override_resource {
    target          = module.docs_api[0].aws_iam_role.execution
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-docs-api-execution" }
  }
  override_resource {
    target          = module.docs_migrate[0].aws_security_group.this
    override_during = plan
    values          = { id = "sg-0d0c5d0c5d0c5d0c5" }
  }

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator.test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    postgres_image     = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image   = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    secret_version_ids = { docs-migrate = "11111111-2222-3333-4444-555555555555" }
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
      docs_migrate   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:7777777777777777777777777777777777777777777777777777777777777777"
    }
  }

  assert {
    condition     = length(module.docs_migrate) == 1 && module.docs_migrate[0].service_name == null
    error_message = "docs-migrate is a task definition only: no ECS service, so it never runs on its own."
  }
  assert {
    condition = (
      jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].image == var.images.docs_migrate &&
      jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].image != var.images.docs_api
    )
    error_message = "docs-migrate runs the images.docs_migrate digest, not the API image."
  }
  assert {
    condition = jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].secrets == [{
      name      = "DATABASE_MIGRATION_URL"
      valueFrom = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf:DATABASE_MIGRATION_URL::11111111-2222-3333-4444-555555555555"
    }]
    error_message = "DATABASE_MIGRATION_URL is the one secret, from the docs-migrate bundle at its pinned version."
  }
  assert {
    condition = (
      { for e in jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].environment : e.name => e.value } == { NODE_ENV = "production", TENANT_SLUG = "munaxa-internal" } &&
      !strcontains(jsonencode(jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].environment), "postgres")
    )
    error_message = "The plain environment is NODE_ENV and the tenant slug: no URL, never the migration URL as plaintext."
  }
  assert {
    condition = alltrue([
      for k in ["docs-api", "docs-operator", "rds!", "DATABASE_URL\"", "TENANT_CATALOGUE", "EDMS_", "REDIS", "JWT_"] :
      !strcontains(module.docs_migrate[0].task_definition_container_definitions, k)
    ])
    error_message = "docs-migrate names no other bundle, no RDS master secret, no application role URL and no API secret."
  }
  assert {
    condition = (
      jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].readonlyRootFilesystem == true &&
      jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].linuxParameters.capabilities.drop == ["ALL"] &&
      !can(jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].portMappings) &&
      !can(jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].healthCheck) &&
      !can(jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].command)
    )
    error_message = "docs-migrate runs read-only with no capabilities, no port and no health check, with the image's own command."
  }
  assert {
    condition = module.docs_migrate[0].execution_role_grants == {
      image_repository_arn = "arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-docs/migrate"
      log_group            = "/munaxa/nonprod/docs-migrate"
      secret_arn           = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf"
    }
    error_message = "The execution role pulls only munaxa-docs/migrate, writes only its own log group and reads only docs-migrate."
  }
  assert {
    condition     = module.docs_migrate[0].task_role_arn == null
    error_message = "docs-migrate has no task role: migrating calls no AWS API."
  }
  assert {
    condition = (
      module.docs_migrate[0].execution_role_arn != module.docs_api[0].execution_role_arn &&
      module.docs_api[0].execution_role_grants.secret_arn == "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-api-GhIjKl"
    )
    error_message = "docs-migrate and docs-api have separate execution roles; the API's still reads only docs-api, never docs-migrate."
  }
  assert {
    condition     = !strcontains(module.docs_api[0].task_definition_container_definitions, "docs-migrate") && !strcontains(module.docs_api[0].task_definition_container_definitions, "DATABASE_MIGRATION_URL") && !strcontains(aws_ecs_task_definition.docs_provision[0].container_definitions, "docs-migrate")
    error_message = "Neither the API nor docs-provision can read the migration URL."
  }
  assert {
    condition     = output.run_task_network.docs_migrate_definition == "munaxa-nonprod-docs-migrate" && output.run_task_network.docs_migrate_group == module.docs_migrate[0].security_group_id
    error_message = "run_task_network names the docs-migrate definition and the group it runs with."
  }
  assert {
    condition     = length(module.docs_api) == 1 && module.docs_api[0].service_name == null && length(aws_ecs_task_definition.docs_provision) == 1
    error_message = "With services off, the API is registered but not running: nothing starts before the operator has run docs-migrate."
  }
}

# L-5 (report 2026-11-12-docs-migration-security-hardening): the owner credential is kept once, as
# docs-migrate's DATABASE_MIGRATION_URL. docs-db-admin sets edms_owner's password from that URL
# (scripts/docs-owner-password.sql, tested against PostgreSQL by docs-owner-password.test.mjs), at the
# same pinned version docs-migrate reads, and docs-operator no longer holds an owner password.
run "docs_db_admin_takes_the_owner_password_only_from_the_migration_url" {
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
    target          = aws_secretsmanager_secret.service["docs-api"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-api-GhIjKl" }
  }
  override_resource {
    target          = aws_iam_role.docs_db_admin_execution[0]
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-docs-db-admin-execution", id = "munaxa-nonprod-docs-db-admin-execution" }
  }

  override_resource {
    target          = aws_secretsmanager_secret.service["docs-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["docs-operator"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-operator-MnOpQr" }
  }
  override_resource {
    target          = aws_kms_key.data
    override_during = plan
    values          = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-0000-0000-00000000da7a" }
  }
  override_resource {
    target          = aws_cloudwatch_log_group.ops
    override_during = plan
    values          = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/nonprod/ops" }
  }

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator.test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    postgres_image     = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image   = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    secret_version_ids = { docs-migrate = "11111111-2222-3333-4444-555555555555", docs-operator = "66666666-7777-8888-9999-000000000000" }
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
      docs_migrate   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:7777777777777777777777777777777777777777777777777777777777777777"
    }
  }

  assert {
    condition = { for s in jsondecode(aws_ecs_task_definition.docs_db_admin[0].container_definitions)[0].secrets : s.name => s.valueFrom if !startswith(s.name, "PG") } == {
      EDMS_APP_PASSWORD      = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-operator-MnOpQr:EDMS_APP_PASSWORD::66666666-7777-8888-9999-000000000000"
      EDMS_BACKUP_PASSWORD   = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-operator-MnOpQr:EDMS_BACKUP_PASSWORD::66666666-7777-8888-9999-000000000000"
      DATABASE_MIGRATION_URL = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf:DATABASE_MIGRATION_URL::11111111-2222-3333-4444-555555555555"
    }
    error_message = "docs-db-admin reads the app and backup passwords from docs-operator and the owner credential only as docs-migrate's URL, at the version docs-migrate is pinned to."
  }
  assert {
    condition = (
      !strcontains(aws_ecs_task_definition.docs_db_admin[0].container_definitions, "EDMS_OWNER_PASSWORD") &&
      strcontains(local.docs_dbadmin_sql, "\\getenv migration_url DATABASE_MIGRATION_URL") &&
      strcontains(local.docs_dbadmin_sql, "ALTER ROLE edms_owner PASSWORD :'owner_pw';") &&
      strcontains(local.docs_dbadmin_sql, "\\if :owner_url_ok") &&
      local.docs_operator_keys == ["EDMS_APP_PASSWORD", "EDMS_BACKUP_PASSWORD"]
    )
    error_message = "No second copy of the owner password: docs-operator has none, and db-admin derives it from the URL, refusing anything but edms_owner on the tenant database."
  }
  assert {
    condition = jsondecode(aws_iam_role_policy.docs_db_admin_execution[0].policy).Statement[0].Resource == [
      "arn:aws:secretsmanager:eu-central-1:229251310592:secret:rds!db-mock",
      "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-operator-MnOpQr",
      "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/docs-migrate-AbCdEf",
    ]
    error_message = "docs-db-admin's execution role reads exactly the RDS master secret, docs-operator and docs-migrate."
  }
  assert {
    condition = (
      !strcontains(module.docs_api[0].task_definition_container_definitions, "docs-migrate") &&
      !strcontains(aws_ecs_task_definition.docs_provision[0].container_definitions, "docs-migrate") &&
      !strcontains(aws_ecs_task_definition.docs_provision[0].container_definitions, "docs-operator") &&
      jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].secrets[0].name == "DATABASE_MIGRATION_URL" &&
      length(jsondecode(module.docs_migrate[0].task_definition_container_definitions)[0].secrets) == 1
    )
    error_message = "The migration connection stays separate: the API and docs-provision never read docs-migrate or docs-operator; docs-migrate reads only its URL."
  }
}

run "docs_without_its_migration_image_is_not_defined" {
  command = plan

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator.test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    edge_enabled     = true
    services_enabled = true
    postgres_image   = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    images = {
      docs_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:4444444444444444444444444444444444444444444444444444444444444444"
      docs_web       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      docs_antivirus = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:6666666666666666666666666666666666666666666666666666666666666666"
    }
  }

  assert {
    condition = (
      length(module.docs_api) == 0 && length(module.docs_web) == 0 && length(module.docs_migrate) == 0 &&
      length(aws_ecs_task_definition.docs_provision) == 0 && length(aws_ecs_task_definition.docs_db_admin) == 0
    )
    error_message = "Without images.docs_migrate no Docs service or task is registered: the API never exists without its migration path."
  }
  assert {
    condition     = length(aws_iam_role.docs_db_admin_execution) == 1 && contains(keys(aws_secretsmanager_secret.service), "docs-operator") && contains(keys(aws_secretsmanager_secret.service), "docs-api")
    error_message = "What follows hosts.docs alone (applied in G3) is unchanged."
  }
  assert {
    condition     = contains(keys(aws_secretsmanager_secret.service), "docs-migrate")
    error_message = "L-5: the docs-migrate bundle (the owner credential) follows hosts.docs, not the Docs images, so a missing or cleared image never deletes it."
  }
}

run "identity_only_config_a1_registers_identity_and_nothing_of_another_product" {
  command = plan

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator-test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image      = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    db_bootstrap_products = ["identity"]
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }

  assert {
    condition     = length(module.identity) == 1 && keys(module.migrate) == ["identity"] && length(aws_ecs_task_definition.identity_bootstrap) == 1 && length(aws_ecs_task_definition.db_admin) == 1
    error_message = "Config A1 registers Identity, its migration, its bootstrap and db-admin."
  }
  assert {
    condition     = length(aws_ecs_task_definition.docs_db_admin) == 0 && length(aws_ecs_task_definition.docs_provision) == 0 && length(module.docs_api) == 0 && length(module.docs_migrate) == 0
    error_message = "Config A1 registers no Docs task definition, although postgres_image and hosts.docs are set."
  }
  assert {
    condition     = sort(keys(aws_secretsmanager_secret.service)) == sort(["docs-api", "docs-operator", "docs-migrate", "identity", "control-api", "identity-migrate", "control-migrate", "work-migrate", "school-migrate", "work-api", "school-api"])
    error_message = "Config A1's ten bundles, plus docs-migrate, which follows hosts.docs since L-5 (the one nonprod create of that change)."
  }
  assert {
    condition     = length(aws_iam_role.docs_db_admin_execution) == 1
    error_message = "The Docs db-admin execution role applied in G3 is kept (it follows hosts.docs)."
  }
  assert {
    condition     = length(module.control_api) == 0 && length(module.control_portal) == 0 && length(module.control_migrate) == 0 && length(aws_kms_key.licence) == 0
    error_message = "Config A1 has no Control resource and no licence key."
  }
  assert {
    condition     = length(module.work_api) == 0 && length(module.work_admin) == 0 && length(module.school_api) == 0 && length(module.school_admin) == 0 && length(aws_ecs_task_definition.school_bootstrap) == 0
    error_message = "Config A1 has no Work or School resource."
  }
  assert {
    condition     = keys(local.routed_ports) == ["identity"] && module.identity[0].service_name == null
    error_message = "Only Identity is routed, and with services off no ECS service exists."
  }
  assert {
    condition     = length(aws_ecs_task_definition.identity_probe) == 0
    error_message = "Without a pinned probe (identity_probe_source) Config A1 registers no probe task definition."
  }
}

# The Identity session probe (identity-probe.tf, report 2026-11-11-identity-probe-task-definition):
# Config A1 plus a pinned probe adds exactly one task definition, which holds only the two operator
# fields of the one-run secret and no database credential, and adds no role, policy or group.
run "identity_probe_is_isolated_from_database_credentials" {
  command = plan

  override_resource {
    target          = aws_iam_role.identity_bootstrap_execution[0]
    override_during = plan
    values          = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-identity-bootstrap-execution" }
  }
  override_resource {
    target          = module.identity[0].aws_security_group.this
    override_during = plan
    values          = { id = "sg-0123456789abcdef0" }
  }

  variables {
    hosts = {
      identity    = "id.test.munaxa.com"
      control_api = "control-api.test.munaxa.com"
      operator    = "operator-test.munaxa.com"
      work        = "work.test.munaxa.com"
      school      = "school.test.munaxa.com"
      docs        = "docs.test.munaxa.com"
    }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    docs_redis_image      = "public.ecr.aws/docker/library/redis@sha256:3333333333333333333333333333333333333333333333333333333333333333"
    db_bootstrap_products = ["identity"]
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
    identity_probe_source = {
      commit = "0123456789abcdef0123456789abcdef01234567"
      sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  }

  assert {
    condition     = length(aws_ecs_task_definition.identity_probe) == 1 && aws_ecs_task_definition.identity_probe[0].family == "munaxa-nonprod-identity-probe"
    error_message = "A pinned probe registers one task definition, munaxa-nonprod-identity-probe."
  }
  assert {
    condition     = aws_ecs_task_definition.identity_probe[0].execution_role_arn == aws_iam_role.identity_bootstrap_execution[0].arn
    error_message = "The probe reuses the identity-bootstrap execution role."
  }
  assert {
    condition     = aws_ecs_task_definition.identity_probe[0].task_role_arn == null || aws_ecs_task_definition.identity_probe[0].task_role_arn == ""
    error_message = "The probe has no task role, so it holds no AWS credentials."
  }
  assert {
    condition     = length(aws_iam_role.identity_bootstrap_execution) == 1 && length(aws_iam_role_policy.identity_bootstrap_execution) == 1 && length(module.identity) == 1
    error_message = "The probe adds no role, policy or security group of its own."
  }
  assert {
    condition = (
      [for s in jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].secrets : s.name] == ["IDENTITY_OWNER_EMAIL", "IDENTITY_OWNER_PASSWORD"] &&
      alltrue([for s in jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].secrets : startswith(s.valueFrom, "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap:IDENTITY_OWNER_")])
    )
    error_message = "The probe's only secrets are the two operator fields of munaxa-nonprod/identity-bootstrap."
  }
  assert {
    condition = alltrue([
      for k in ["DATABASE_URL", "DIRECT_DATABASE_URL", "DATABASE_MIGRATION_URL", "MIGRATION", "rds!", "identity-migrate", "REDIS_PASSWORD", "PRIVATE KEY"] :
      !strcontains(aws_ecs_task_definition.identity_probe[0].container_definitions, k)
    ])
    error_message = "The probe's container definition names no database URL, migrate bundle, RDS master secret, Redis password or private key."
  }
  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].readonlyRootFilesystem == true &&
      jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].image == var.images.identity_api &&
      jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].linuxParameters.capabilities.drop == ["ALL"]
    )
    error_message = "The probe runs the identity_api digest, with a read-only root filesystem and no capabilities."
  }
  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].logConfiguration.options["awslogs-group"] == "/munaxa/nonprod/ops" &&
      jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].logConfiguration.options["awslogs-stream-prefix"] == "identity-probe"
    )
    error_message = "The probe logs to the ops log group under the identity-probe prefix."
  }
  assert {
    condition = (
      { for e in jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].environment : e.name => e.value } == {
        NODE_ENV               = "production"
        PROBE_COMMIT           = "0123456789abcdef0123456789abcdef01234567"
        PROBE_SHA256           = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        PROBE_HOST             = "id.test.munaxa.com"
        PROBE_ISSUER           = "https://id.test.munaxa.com"
        PROBE_AUDIENCES        = "munaxa-work,munaxa-control"
        PROBE_ORGANISATION     = "munaxa-group"
        PROBE_SIGNING_KID      = "identity-test-2026-11"
        PROBE_PUBLIC_KEYS      = var.identity_public_keys
        PROBE_OPERATOR_HOST    = "operator-test.munaxa.com"
        PROBE_CONTROL_API_HOST = "control-api.test.munaxa.com"
        PROBE_UNKNOWN_HOST     = "unknown.test.munaxa.com"
      }
    )
    error_message = "The probe's environment is the public set only."
  }
  assert {
    condition = (
      slice(jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].command, 0, 3) == ["node", "--input-type=module", "-e"] &&
      strcontains(jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].command[3], "const COMMIT = '0123456789abcdef0123456789abcdef01234567';") &&
      strcontains(jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].command[3], "const SHA256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';") &&
      !strcontains(jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].command[3], "__PROBE_") &&
      !strcontains(jsondecode(aws_ecs_task_definition.identity_probe[0].container_definitions)[0].command[3], "rejectUnauthorized")
    )
    error_message = "The probe command is the loader with the pin written in, and never turns certificate checking off."
  }
  assert {
    condition     = output.run_task_network.identity_probe_definition == "munaxa-nonprod-identity-probe" && output.run_task_network.identity_group == module.identity[0].security_group_id
    error_message = "run_task_network names the probe definition and the identity group it runs with."
  }
}

run "identity_probe_pin_must_be_a_full_commit_and_sha256" {
  command = plan

  variables {
    identity_probe_source = {
      commit = "0123456"
      sha256 = ""
    }
  }

  expect_failures = [var.identity_probe_source]
}

# --- AW-01: the hardened Identity contract (report 2026-11-11-identity-aw01-remediation) ---------
#
# Identity main after identity#7 to #14 refuses NODE_ENV=production without MFA_ENCRYPTION_KEYS,
# a MFA_ENCRYPTION_PRIMARY_KID that names one of its entries, and IDENTITY_PASSWORD_RESET=disabled.
# identity_security_config switches that contract on with the image; null keeps release 5277d71's
# task definition exactly as Config A1 registered it.

run "aw01_without_security_config_identity_keeps_the_5277d71_contract" {
  command = plan

  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-AbCdEf" }
  }

  variables {
    db_bootstrap_products = ["identity"]
    secret_version_ids    = { identity = "00000000-0000-4000-8000-000000000001" }
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  }

  assert {
    condition = sort([for e in jsondecode(module.identity[0].task_definition_container_definitions)[0].environment : e.name]) == sort([
      "CSRF_TRUSTED_ORIGINS", "IDENTITY_AUTH_AUDIENCE", "IDENTITY_BASE_URL", "IDENTITY_DEFAULT_ORGANISATION", "IDENTITY_SIGNING_ALGORITHM",
      "IDENTITY_SIGNING_KID", "LOG_PRETTY", "NODE_ENV", "PORT", "TRUST_PROXY_HOPS",
    ])
    error_message = "Without identity_security_config the Identity environment is exactly the ten names release 5277d71 reads."
  }
  assert {
    condition = jsonencode(jsondecode(module.identity[0].task_definition_container_definitions)[0].environment) == jsonencode([
      { name = "CSRF_TRUSTED_ORIGINS", value = "https://id.test.munaxa.com,https://work.test.munaxa.com,https://operator.test.munaxa.com" },
      { name = "IDENTITY_AUTH_AUDIENCE", value = "munaxa-work,munaxa-control" },
      { name = "IDENTITY_BASE_URL", value = "https://id.test.munaxa.com" },
      { name = "IDENTITY_DEFAULT_ORGANISATION", value = "" },
      { name = "IDENTITY_SIGNING_ALGORITHM", value = "ES256" },
      { name = "IDENTITY_SIGNING_KID", value = "identity-test-2026-11" },
      { name = "LOG_PRETTY", value = "false" },
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4001" },
      { name = "TRUST_PROXY_HOPS", value = "1" },
    ])
    error_message = "Without identity_security_config every Identity environment value is the one release 5277d71 runs with."
  }
  assert {
    condition     = jsondecode(module.identity[0].task_definition_container_definitions)[0].image == var.images.identity_api && length(jsondecode(module.identity[0].task_definition_container_definitions)) == 2 && jsondecode(module.identity[0].task_definition_container_definitions)[1].name == "valkey"
    error_message = "Without identity_security_config Identity keeps its digest and its single Valkey sidecar."
  }
  assert {
    condition = [for s in jsondecode(module.identity[0].task_definition_container_definitions)[0].secrets : s.valueFrom] == [
      for k in ["DATABASE_URL", "IDENTITY_SIGNING_PRIVATE_KEY", "IDENTITY_SIGNING_SECRET", "REDIS_URL", "REDIS_PASSWORD"] :
      "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-AbCdEf:${k}::00000000-0000-4000-8000-000000000001"
    ]
    error_message = "Without identity_security_config Identity reads exactly its five bundle keys, pinned, and no MFA_ENCRYPTION_KEYS (5277d71 does not read it and a missing JSON key stops the task)."
  }
  assert {
    condition     = !strcontains(module.identity[0].task_definition_container_definitions, "MFA_") && !strcontains(module.identity[0].task_definition_container_definitions, "IDENTITY_PASSWORD_RESET")
    error_message = "Release 5277d71's task definition carries no MFA or password-reset setting."
  }
}

run "aw01_hardened_identity_reads_the_mfa_key_ring_and_disables_reset" {
  command = plan

  override_resource {
    target          = aws_secretsmanager_secret.service["identity"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-AbCdEf" }
  }
  override_resource {
    target          = aws_secretsmanager_secret.service["identity-migrate"]
    override_during = plan
    values          = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-migrate-GhIjKl" }
  }

  variables {
    db_bootstrap_products = ["identity"]
    secret_version_ids    = { identity = "00000000-0000-4000-8000-000000000002" }
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    }
    identity_security_config = {
      mfa_primary_kid = "nonprod-2026-11"
      mfa_policy      = "off"
    }
  }

  # 1, 2: the bundle contract has the key, and the task reads it from the identity bundle, pinned.
  assert {
    condition     = local.secret_keys["identity"] == ["DATABASE_URL", "IDENTITY_SIGNING_PRIVATE_KEY", "IDENTITY_SIGNING_SECRET", "REDIS_URL", "REDIS_PASSWORD", "MFA_ENCRYPTION_KEYS"]
    error_message = "The identity bundle contract gains MFA_ENCRYPTION_KEYS and nothing else."
  }
  assert {
    condition = {
      for s in jsondecode(module.identity[0].task_definition_container_definitions)[0].secrets : s.name => s.valueFrom
    }["MFA_ENCRYPTION_KEYS"] == "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-AbCdEf:MFA_ENCRYPTION_KEYS::00000000-0000-4000-8000-000000000002"
    error_message = "MFA_ENCRYPTION_KEYS comes from its own JSON key of the identity bundle, at the pinned version: never another key, bundle or version."
  }
  assert {
    condition     = length(jsondecode(module.identity[0].task_definition_container_definitions)[0].secrets) == 6 && alltrue([for s in jsondecode(module.identity[0].task_definition_container_definitions)[0].secrets : s.valueFrom == "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-AbCdEf:${s.name}::00000000-0000-4000-8000-000000000002"])
    error_message = "Every Identity secret is the JSON key of its own name in the identity bundle; no alias maps MFA_ENCRYPTION_KEYS to the signing key or the pepper."
  }

  # 3, 4, 5: the plain settings.
  assert {
    condition = {
      for e in jsondecode(module.identity[0].task_definition_container_definitions)[0].environment : e.name => e.value
      if contains(["MFA_ENCRYPTION_PRIMARY_KID", "MFA_POLICY", "MFA_PRIVILEGED_ROLES", "IDENTITY_PASSWORD_RESET"], e.name)
      } == {
      MFA_ENCRYPTION_PRIMARY_KID = "nonprod-2026-11"
      MFA_POLICY                 = "off"
      IDENTITY_PASSWORD_RESET    = "disabled"
    }
    error_message = "The hardened image gets its primary kid, an explicit MFA_POLICY=off, password reset disabled, and no MFA_PRIVILEGED_ROLES with policy off."
  }
  assert {
    condition     = length(jsondecode(module.identity[0].task_definition_container_definitions)[0].environment) == 13
    error_message = "The hardened environment is the ten 5277d71 names plus exactly three."
  }

  # 6: no secret in the plain environment, and no name is both.
  assert {
    condition = length(setintersection(
      [for e in jsondecode(module.identity[0].task_definition_container_definitions)[0].environment : e.name],
      [for s in jsondecode(module.identity[0].task_definition_container_definitions)[0].secrets : s.name],
    )) == 0
    error_message = "No variable is both a plain value and a secret (a plain MFA_ENCRYPTION_KEYS would override nothing and leak everything)."
  }
  assert {
    condition = !anytrue([
      for e in jsondecode(module.identity[0].task_definition_container_definitions)[0].environment :
      can(regex("[A-Za-z0-9_-]+=[A-Za-z0-9+/_-]{43}", e.value)) || strcontains(e.value, "PRIVATE KEY")
    ])
    error_message = "No plain value has the shape of an MFA key entry or a private key."
  }

  # 7: other bundles are unchanged.
  assert {
    condition = (
      local.secret_keys["control-api"] == ["DATABASE_URL"] &&
      local.secret_keys["work-api"] == ["DATABASE_URL", "PII_MATCH_SECRET", "CONTROL_PLANE_TOKEN"] &&
      local.secret_keys["school-api"] == ["DATABASE_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "CONTROL_PLANE_TOKEN", "RESEND_API_KEY"] &&
      alltrue([for k in ["identity-migrate", "control-migrate", "work-migrate", "school-migrate"] : local.secret_keys[k] == ["DATABASE_MIGRATION_URL"]]) &&
      length(aws_secretsmanager_secret.service) == 8
    )
    error_message = "Only the identity bundle contract changes; no bundle is added or removed."
  }
  assert {
    condition = (
      !strcontains(aws_ecs_task_definition.identity_bootstrap[0].container_definitions, "MFA_") &&
      !strcontains(module.migrate["identity"].task_definition_container_definitions, "MFA_")
    )
    error_message = "The migration and bootstrap tasks do not read the MFA key ring: only the API seals and opens TOTP secrets."
  }

  # 9: the execution/task role split holds: Identity still has no task role.
  assert {
    condition     = module.identity[0].task_role_arn == null
    error_message = "Identity runs without a task role; only its execution role reads the bundle."
  }

  # 10: still the pinned digest.
  assert {
    condition     = jsondecode(module.identity[0].task_definition_container_definitions)[0].image == var.images.identity_api && can(regex("@sha256:[0-9a-f]{64}$", jsondecode(module.identity[0].task_definition_container_definitions)[0].image))
    error_message = "The Identity task definition runs the digest-pinned identity_api image."
  }
}

run "aw01_privileged_policy_passes_its_role_keys" {
  command = plan

  variables {
    environment = "prod"
    vpc_cidr    = "10.131.0.0/16"
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
    identity_security_config = {
      mfa_primary_kid      = "prod-2026-12"
      mfa_policy           = "privileged"
      mfa_privileged_roles = ["role-a", "role-b"]
    }
  }

  assert {
    condition     = tomap(local.identity_security_environment) == tomap({ MFA_ENCRYPTION_PRIMARY_KID = "prod-2026-12", MFA_POLICY = "privileged", MFA_PRIVILEGED_ROLES = "role-a,role-b", IDENTITY_PASSWORD_RESET = "disabled" })
    error_message = "With privileged, MFA_PRIVILEGED_ROLES is the comma-joined role keys Identity's list() parses back."
  }
}

run "aw01_privileged_without_roles_is_refused" {
  command = plan
  variables {
    identity_security_config = { mfa_primary_kid = "nonprod-2026-11", mfa_policy = "privileged" }
  }
  expect_failures = [var.identity_security_config]
}

run "aw01_roles_without_privileged_are_refused" {
  command = plan
  variables {
    identity_security_config = { mfa_primary_kid = "nonprod-2026-11", mfa_policy = "off", mfa_privileged_roles = ["role-a"] }
  }
  expect_failures = [var.identity_security_config]
}

run "aw01_an_unknown_policy_is_refused" {
  command = plan
  variables {
    identity_security_config = { mfa_primary_kid = "nonprod-2026-11", mfa_policy = "required" }
  }
  expect_failures = [var.identity_security_config]
}

run "aw01_a_kid_with_a_key_entry_is_refused" {
  command = plan
  variables {
    identity_security_config = { mfa_primary_kid = "k1=not-a-real-key", mfa_policy = "off" }
  }
  expect_failures = [var.identity_security_config]
}

run "aw01_a_key_shaped_kid_is_refused" {
  command = plan
  variables {
    # 43 characters, the length of 32 bytes in base64url. Not key material: a fixed test string.
    identity_security_config = { mfa_primary_kid = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", mfa_policy = "off" }
  }
  expect_failures = [var.identity_security_config]
}

run "aw01_a_role_key_with_a_comma_is_refused" {
  command = plan
  variables {
    identity_security_config = { mfa_primary_kid = "nonprod-2026-11", mfa_policy = "privileged", mfa_privileged_roles = ["role-a,role-b"] }
  }
  expect_failures = [var.identity_security_config]
}
