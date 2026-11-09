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
    condition     = length(aws_ecs_task_definition.docs_db_admin) == 0 && length(aws_ecs_task_definition.docs_provision) == 0 && length(module.docs_api) == 0
    error_message = "Config A1 registers no Docs task definition, although postgres_image and hosts.docs are set."
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
}
