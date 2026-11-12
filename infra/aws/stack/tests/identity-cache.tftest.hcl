# Identity cache and Identity deployment topology (identity-cache.tf, services.tf, variables.tf).
# Mocked AWS provider: no credentials, no AWS call. Phase A, report 2026-11-12-phase-a-identity-valkey-implementation.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  # Mocked applies (command = apply) below compare references between resources; the provider
  # validates ARN-shaped arguments, so the mocks return ARN-shaped values.
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:eu-central-1:229251310592:key/00000000-0000-4000-8000-00000000000a" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/mock" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-mock-AbCdEf" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:eu-central-1:229251310592:munaxa-prod-ops" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/mock" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-mock" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-mock:1" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:targetgroup/munaxa-mock/0123456789abcdef" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::munaxa-mock" }
  }
  mock_resource "aws_acm_certificate" {
    defaults = { arn = "arn:aws:acm:eu-central-1:229251310592:certificate/00000000-0000-4000-8000-00000000000b" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:eu-central-1:229251310592:service/srv-mock" }
  }
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

# --- Testing: one task, one sidecar, stop before start ------------------------------------------

run "testing_identity_sidecar_stops_the_old_task_before_starting_the_new_one" {
  command = plan

  variables {
    services_enabled = true
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }

  assert {
    condition     = module.identity[0].service_deployment.minimum_healthy_percent == 0 && module.identity[0].service_deployment.maximum_percent == 100
    error_message = "With the sidecar store Identity deploys at 0 % / 100 %: the old task stops before the new one starts, so two stores never serve together."
  }
  assert {
    condition     = module.identity[0].service_deployment.desired_count == 1
    error_message = "Testing runs one Identity task."
  }
  assert {
    condition     = module.identity[0].service_deployment.circuit_breaker && module.identity[0].service_deployment.circuit_rollback
    error_message = "The circuit breaker still rolls a failed deployment back."
  }
  assert {
    condition     = length(module.identity[0].service_deployment.security_groups) == 1
    error_message = "Testing Identity carries only its own group: no cache-client group exists."
  }
  assert {
    condition = (
      length(aws_elasticache_replication_group.identity) == 0 && length(aws_security_group.identity_cache) == 0 &&
      length(aws_security_group.identity_cache_client) == 0 && length(aws_sns_topic.ops) == 0 &&
      length(module.identity_cache_auth) == 0 && length(aws_cloudwatch_metric_alarm.identity_cache) == 0
    )
    error_message = "Testing creates no ElastiCache resource, no ops topic and no ephemeral secret read."
  }
}

run "testing_sidecar_is_reachable_only_inside_its_task" {
  command = apply

  variables {
    services_enabled = true
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }

  assert {
    condition     = length(jsondecode(module.identity[0].task_definition_container_definitions)) == 2
    error_message = "The Testing task is Identity and its Valkey sidecar."
  }
  assert {
    condition     = length(try(jsondecode(module.identity[0].task_definition_container_definitions)[1].portMappings, [])) == 0
    error_message = "The sidecar publishes no port: nothing outside the task can reach it."
  }
  assert {
    condition = alltrue([
      for flag in ["--bind 127.0.0.1", "--protected-mode yes", "--maxmemory-policy noeviction", "--save ''", "--appendonly no", "requirepass"] :
      strcontains(join(" ", jsondecode(module.identity[0].task_definition_container_definitions)[1].command), flag)
    ])
    error_message = "The sidecar listens on loopback only, with a password, noeviction and no persistence."
  }
  assert {
    condition     = jsondecode(module.identity[0].task_definition_container_definitions)[0].dependsOn[0].condition == "HEALTHY"
    error_message = "Identity starts only after Valkey is healthy."
  }
}

run "other_services_keep_the_ecs_deployment_defaults" {
  command = plan

  variables {
    edge_enabled          = true
    services_enabled      = true
    operator_access       = { team_domain = "https://munaxa-test.cloudflareaccess.com", audience = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    db_bootstrap_products = ["identity", "control", "work", "school"]
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab"
      control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      work_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/api@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      work_admin       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-work/admin@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      school_api       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-school/api@sha256:0000000000000000000000000000000000000000000000000000000000000000"
      school_admin     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-school/admin@sha256:0000000000000000000000000000000000000000000000000000000000000001"
    }
  }

  assert {
    condition = alltrue([
      for s in [
        module.control_api[0].service_deployment, module.control_portal[0].service_deployment,
        module.work_api[0].service_deployment, module.work_admin[0].service_deployment,
        module.school_api[0].service_deployment, module.school_admin[0].service_deployment,
      ] : s.minimum_healthy_percent == null && s.maximum_percent == null && length(s.security_groups) == 1
    ])
    error_message = "Every other service keeps ECS's deployment defaults (100 % / 200 %) and only its own group: the change is Identity's alone."
  }
}

run "testing_sidecar_with_two_tasks_is_refused" {
  command = plan
  variables {
    desired_counts = { identity = 2 }
  }
  expect_failures = [var.valkey_image]
}

run "testing_never_gets_the_shared_cache" {
  command = plan
  variables {
    valkey_image       = ""
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
  }
  expect_failures = [var.identity_cache]
}

# --- Production: the shared cache, never a sidecar -----------------------------------------------

run "production_never_registers_a_sidecar_even_with_services_off" {
  command = plan
  variables {
    environment = "prod"
    vpc_cidr    = "10.131.0.0/16"
    # valkey_image is set by the file's variables; services and images stay off.
  }
  expect_failures = [var.valkey_image]
}

run "production_identity_without_the_shared_cache_is_refused" {
  command = plan
  variables {
    environment  = "prod"
    vpc_cidr     = "10.131.0.0/16"
    valkey_image = ""
    images = {
      identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
  }
  expect_failures = [var.identity_cache]
}

run "production_with_both_stores_is_refused" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
  }
  # The production no-sidecar rule fires first; identity_cache, which refers to valkey_image, is
  # then not evaluated (an input that failed its validation is not used further).
  expect_failures = [var.valkey_image]
}

run "the_cache_without_a_pinned_bundle_version_is_refused" {
  command = plan
  variables {
    environment    = "prod"
    vpc_cidr       = "10.131.0.0/16"
    valkey_image   = ""
    identity_cache = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }
  expect_failures = [var.identity_cache]
}

run "the_cache_refuses_more_than_one_replica" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 2, engine_version = "8.1", auth_token_version = 1 }
  }
  expect_failures = [var.identity_cache]
}

run "the_cache_refuses_another_engine_major" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "7.2", auth_token_version = 1 }
  }
  expect_failures = [var.identity_cache]
}

run "the_cache_refuses_a_malformed_node_type" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }
  expect_failures = [var.identity_cache]
}

run "the_cache_refuses_a_token_version_below_one" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 0 }
  }
  expect_failures = [var.identity_cache]
}

run "the_cache_refuses_deleting_its_authentication" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 2, auth_token_update_strategy = "DELETE" }
  }
  expect_failures = [var.identity_cache]
}

run "a_missing_auth_token_stops_the_plan_without_quoting_the_bundle" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }
  # What modules/secret-key-ephemeral returns for a bundle without REDIS_PASSWORD (or not JSON).
  override_module {
    target  = module.identity_cache_auth
    outputs = { value = "" }
  }
  expect_failures = [aws_elasticache_replication_group.identity]
}

run "a_token_that_is_not_url_safe_stops_the_plan" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }
  override_module {
    target  = module.identity_cache_auth
    outputs = { value = "placeholder/with@characters:that-break-a-url-0123" }
  }
  expect_failures = [aws_elasticache_replication_group.identity]
}

run "a_short_token_stops_the_plan" {
  command = plan
  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }
  override_module {
    target  = module.identity_cache_auth
    outputs = { value = "only-sixteen-chr" }
  }
  expect_failures = [aws_elasticache_replication_group.identity]
}

# Mocked apply: the provider invents ids, so references between resources can be compared.
run "production_cache_is_private_encrypted_authenticated_and_never_evicts" {
  command = apply

  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
  }

  assert {
    condition = (
      aws_elasticache_replication_group.identity[0].engine == "valkey" &&
      aws_elasticache_replication_group.identity[0].engine_version == "8.1" &&
      aws_elasticache_replication_group.identity[0].node_type == "cache.t4g.micro" &&
      aws_elasticache_replication_group.identity[0].num_cache_clusters == 1 &&
      aws_elasticache_replication_group.identity[0].port == 6379
    )
    error_message = "One cache.t4g.micro Valkey 8.1 node on 6379."
  }
  assert {
    condition = (
      aws_elasticache_replication_group.identity[0].transit_encryption_enabled &&
      aws_elasticache_replication_group.identity[0].transit_encryption_mode == "required" &&
      aws_elasticache_replication_group.identity[0].at_rest_encryption_enabled &&
      aws_elasticache_replication_group.identity[0].kms_key_id == aws_kms_key.data.arn
    )
    error_message = "TLS is required, and the data key encrypts the cache at rest."
  }
  assert {
    condition = (
      aws_elasticache_replication_group.identity[0].auth_token_wo_version == 1 &&
      aws_elasticache_replication_group.identity[0].auth_token_update_strategy == "ROTATE" &&
      aws_elasticache_replication_group.identity[0].auth_token_wo == null &&
      aws_elasticache_replication_group.identity[0].auth_token == null
    )
    error_message = "The AUTH token goes only through the write-only argument: nothing of it is in state (auth_token_wo reads back null, auth_token is unused)."
  }
  assert {
    condition     = aws_elasticache_replication_group.identity[0].snapshot_retention_limit == 0 && aws_elasticache_replication_group.identity[0].final_snapshot_identifier == null
    error_message = "No snapshot is ever kept: old lockout and replay state must not come back."
  }
  assert {
    condition = (
      aws_elasticache_parameter_group.identity[0].family == "valkey8" &&
      aws_elasticache_replication_group.identity[0].parameter_group_name == aws_elasticache_parameter_group.identity[0].name &&
      [for p in aws_elasticache_parameter_group.identity[0].parameter : p.value if p.name == "maxmemory-policy"] == ["noeviction"]
    )
    error_message = "The cache uses its own valkey8 parameter group with maxmemory-policy noeviction."
  }
  assert {
    condition = (
      toset(aws_elasticache_subnet_group.identity[0].subnet_ids) == toset([for s in aws_subnet.db : s.id]) &&
      aws_elasticache_replication_group.identity[0].subnet_group_name == aws_elasticache_subnet_group.identity[0].name &&
      length(aws_route_table.db.route) == 0 &&
      aws_route.public_internet.route_table_id == aws_route_table.public.id
    )
    error_message = "The cache is in the three isolated database subnets, whose route table has local routes only."
  }
  assert {
    condition = (
      toset(aws_elasticache_replication_group.identity[0].security_group_ids) == toset([aws_security_group.identity_cache[0].id]) &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].security_group_id == aws_security_group.identity_cache[0].id &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].referenced_security_group_id == aws_security_group.identity_cache_client[0].id &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].cidr_ipv4 == null &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].cidr_ipv6 == null &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].from_port == 6379 &&
      aws_vpc_security_group_ingress_rule.identity_cache_from_client[0].to_port == 6379
    )
    error_message = "The cache's only group admits 6379 from the cache-client group and from no address range."
  }
  assert {
    condition = (
      aws_vpc_security_group_egress_rule.identity_cache_client_to_cache[0].security_group_id == aws_security_group.identity_cache_client[0].id &&
      aws_vpc_security_group_egress_rule.identity_cache_client_to_cache[0].referenced_security_group_id == aws_security_group.identity_cache[0].id &&
      aws_vpc_security_group_egress_rule.identity_cache_client_to_cache[0].from_port == 6379
    )
    error_message = "The cache-client group may reach the cache on 6379 and nothing else through this rule."
  }
  assert {
    condition = (
      length(aws_cloudwatch_metric_alarm.identity_cache) == 4 &&
      alltrue([for a in aws_cloudwatch_metric_alarm.identity_cache : a.alarm_actions == toset([aws_sns_topic.ops[0].arn]) && a.dimensions.CacheClusterId == "munaxa-prod-identity-001"]) &&
      toset([for a in aws_cloudwatch_metric_alarm.identity_cache : a.metric_name]) == toset(["CPUUtilization", "DatabaseMemoryUsagePercentage", "Evictions", "CurrConnections"])
    )
    error_message = "Four alarms on the one node, each to the ops topic; no replication-lag alarm without a replica."
  }
  assert {
    condition     = aws_sns_topic.ops[0].kms_master_key_id == aws_kms_key.data.arn && strcontains(aws_kms_key.data.policy, "CloudWatchAlarmsToOpsTopic")
    error_message = "The ops topic is encrypted with the data key, which admits CloudWatch alarms of this account."
  }
  assert {
    condition     = length(aws_elasticache_replication_group.identity[0].log_delivery_configuration) == 0
    error_message = "No engine log delivery: the slow log would copy command values (MFA and session state) to CloudWatch."
  }
  assert {
    condition     = output.identity_cache.primary_endpoint == aws_elasticache_replication_group.identity[0].primary_endpoint_address && output.identity_cache.port == 6379
    error_message = "The primary endpoint is an output, for the operator's REDIS_URL."
  }
}

run "testing_key_policy_is_unchanged_without_the_cache" {
  command = apply

  assert {
    condition     = !strcontains(aws_kms_key.data.policy, "CloudWatchAlarmsToOpsTopic") && length(jsondecode(aws_kms_key.data.policy).Statement) == 2
    error_message = "Without the cache the data key policy keeps its two statements (Testing's key is not changed)."
  }
  assert {
    condition     = output.identity_cache == null
    error_message = "No cache output in Testing."
  }
}

run "a_replica_adds_multi_az_failover_in_place" {
  command = apply

  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 1, engine_version = "8.1", auth_token_version = 1 }
  }

  assert {
    condition = (
      aws_elasticache_replication_group.identity[0].num_cache_clusters == 2 &&
      aws_elasticache_replication_group.identity[0].automatic_failover_enabled &&
      aws_elasticache_replication_group.identity[0].multi_az_enabled &&
      aws_elasticache_replication_group.identity[0].replication_group_id == "munaxa-prod-identity"
    )
    error_message = "replicas = 1 is the same group with a second node and Multi-AZ automatic failover."
  }
  assert {
    condition     = length(aws_cloudwatch_metric_alarm.identity_cache) == 9 && aws_cloudwatch_metric_alarm.identity_cache["munaxa-prod-identity-002-replication-lag"].metric_name == "ReplicationLag"
    error_message = "Each node has its four alarms, and the replica its replication-lag alarm."
  }
}

run "production_identity_service_alone_carries_the_cache_client_group" {
  command = apply

  variables {
    environment        = "prod"
    vpc_cidr           = "10.131.0.0/16"
    services_enabled   = true
    valkey_image       = ""
    secret_version_ids = { identity = "00000000-0000-4000-8000-000000000001" }
    identity_cache     = { node_type = "cache.t4g.micro", replicas = 0, engine_version = "8.1", auth_token_version = 1 }
    desired_counts     = { identity = 2 }
    identity_probe_source = {
      commit = "0123456789abcdef0123456789abcdef01234567"
      sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
    postgres_image        = "public.ecr.aws/docker/library/postgres@sha256:2222222222222222222222222222222222222222222222222222222222222222"
    db_bootstrap_products = ["identity"]
    identity_security_config = {
      mfa_primary_kid = "prod-2026-12"
      mfa_policy      = "off"
    }
    images = {
      identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccd"
    }
  }

  assert {
    condition = (
      toset(module.identity[0].service_deployment.security_groups) == toset([module.identity[0].security_group_id, aws_security_group.identity_cache_client[0].id]) &&
      module.identity[0].service_deployment.desired_count == 2
    )
    error_message = "Production runs two Identity tasks, and the service carries its own group and the cache-client group."
  }
  assert {
    condition     = module.identity[0].service_deployment.minimum_healthy_percent == null && module.identity[0].service_deployment.maximum_percent == null
    error_message = "With the shared store Identity keeps ECS's rolling defaults: overlapping tasks share one store."
  }
  assert {
    condition     = length(jsondecode(module.identity[0].task_definition_container_definitions)) == 1
    error_message = "Production Identity's task has no sidecar."
  }
  assert {
    condition = (
      output.run_task_network.identity_group == module.identity[0].security_group_id &&
      output.run_task_network.identity_group != aws_security_group.identity_cache_client[0].id &&
      output.run_task_network.db_admin_group != aws_security_group.identity_cache_client[0].id
    )
    error_message = "The probe, bootstrap and db-admin tasks run without the cache-client group, so the cache does not admit them."
  }
  assert {
    condition     = length(aws_ecs_task_definition.identity_probe) == 1
    error_message = "The probe task definition exists in this run, so the previous assertion covers it."
  }
}
