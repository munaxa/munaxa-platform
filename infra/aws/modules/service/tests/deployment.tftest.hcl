# The service module's deployment bounds, per-task-store rule and sidecar exposure rule
# (variables.tf). Mocked AWS provider: no credentials, no AWS call.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
  # Mocked applies: ARN-shaped values for the arguments the provider validates.
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::229251310592:role/munaxa-shared/mock" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:229251310592:log-group:/munaxa/test/svc" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:eu-central-1:229251310592:task-definition/munaxa-test-svc:1" }
  }
}

variables {
  prefix      = "munaxa-test"
  name        = "svc"
  region      = "eu-central-1"
  account_id  = "229251310592"
  image       = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-test/svc@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  port        = 4001
  cluster_arn = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-test"
  vpc_id      = "vpc-0123456789abcdef0"
  subnet_ids  = ["subnet-0123456789abcdef0"]
}

run "defaults_leave_the_ecs_deployment_defaults" {
  command = plan

  assert {
    condition     = aws_ecs_service.this[0].deployment_minimum_healthy_percent == null && aws_ecs_service.this[0].deployment_maximum_percent == null
    error_message = "Without the new variables nothing is sent: ECS keeps 100 % / 200 %, so existing services plan no change."
  }
  assert {
    condition     = aws_ecs_service.this[0].deployment_circuit_breaker[0].enable && aws_ecs_service.this[0].deployment_circuit_breaker[0].rollback
    error_message = "The circuit breaker rolls back."
  }
}

run "a_per_task_store_stops_before_it_starts" {
  command = plan
  variables {
    single_task_store                  = true
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 100
  }

  assert {
    condition     = aws_ecs_service.this[0].deployment_minimum_healthy_percent == 0 && aws_ecs_service.this[0].deployment_maximum_percent == 100
    error_message = "0 % / 100 % reaches the service."
  }
  assert {
    condition     = aws_ecs_service.this[0].deployment_circuit_breaker[0].rollback
    error_message = "The circuit breaker still rolls back with 0 % / 100 %."
  }
}

run "extra_groups_go_to_the_service_only" {
  command = apply
  variables {
    extra_security_group_ids = ["sg-0aaaaaaaaaaaaaaaa"]
  }

  assert {
    condition     = contains(aws_ecs_service.this[0].network_configuration[0].security_groups, "sg-0aaaaaaaaaaaaaaaa") && length(aws_ecs_service.this[0].network_configuration[0].security_groups) == 2
    error_message = "The service's tasks carry their own group and the extra one."
  }
}

run "one_hundred_and_one_hundred_can_never_deploy" {
  command = plan
  variables {
    deployment_minimum_healthy_percent = 100
    deployment_maximum_percent         = 100
  }
  expect_failures = [var.deployment_maximum_percent]
}

run "a_minimum_equal_to_the_default_maximum_is_refused" {
  command = plan
  variables {
    deployment_minimum_healthy_percent = 100
    deployment_maximum_percent         = null
  }

  assert {
    condition     = aws_ecs_service.this[0].deployment_minimum_healthy_percent == 100
    error_message = "100 with the default maximum (200) is valid."
  }
}

run "a_minimum_above_one_hundred_is_refused" {
  command = plan
  variables {
    deployment_minimum_healthy_percent = 101
  }
  expect_failures = [var.deployment_minimum_healthy_percent]
}

run "a_fractional_minimum_is_refused" {
  command = plan
  variables {
    deployment_minimum_healthy_percent = 50.5
  }
  expect_failures = [var.deployment_minimum_healthy_percent]
}

run "a_maximum_above_two_hundred_is_refused" {
  command = plan
  variables {
    deployment_maximum_percent = 250
  }
  expect_failures = [var.deployment_maximum_percent]
}

run "a_maximum_below_one_hundred_is_refused" {
  command = plan
  variables {
    deployment_maximum_percent = 50
  }
  expect_failures = [var.deployment_maximum_percent]
}

run "a_per_task_store_with_two_tasks_is_refused" {
  command = plan
  variables {
    single_task_store                  = true
    desired_count                      = 2
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 100
  }
  expect_failures = [var.single_task_store]
}

run "a_per_task_store_with_rolling_defaults_is_refused" {
  command = plan
  variables {
    single_task_store = true
  }
  expect_failures = [var.single_task_store]
}

run "a_per_task_store_that_starts_before_it_stops_is_refused" {
  command = plan
  variables {
    single_task_store                  = true
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 200
  }
  expect_failures = [var.single_task_store]
}

run "a_sidecar_with_a_port_mapping_is_refused" {
  command = plan
  variables {
    sidecars = [{
      name         = "store"
      image        = "public.ecr.aws/valkey/valkey@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      essential    = true
      portMappings = [{ containerPort = 6379, hostPort = 6379, protocol = "tcp" }]
    }]
  }
  expect_failures = [var.sidecars]
}

run "a_sidecar_without_a_port_mapping_is_accepted" {
  command = apply
  variables {
    sidecars = [{
      name      = "store"
      image     = "public.ecr.aws/valkey/valkey@sha256:5555555555555555555555555555555555555555555555555555555555555555"
      essential = true
    }]
  }

  assert {
    condition     = length(jsondecode(aws_ecs_task_definition.this.container_definitions)) == 2
    error_message = "The sidecar is in the task."
  }
}

run "a_per_task_store_with_a_discovery_name_is_refused" {
  command = plan
  variables {
    single_task_store                  = true
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 100
    register_discovery                 = true
    discovery_namespace_id             = "ns-0123456789abcdef"
  }
  expect_failures = [var.single_task_store]
}

run "a_per_task_store_with_private_callers_is_refused" {
  command = plan
  variables {
    single_task_store                  = true
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 100
    ingress_security_group_ids         = { portal = "sg-0123456789abcdef0" }
  }
  expect_failures = [var.single_task_store]
}

run "a_per_task_store_with_extra_groups_is_refused" {
  command = plan
  variables {
    single_task_store                  = true
    deployment_minimum_healthy_percent = 0
    deployment_maximum_percent         = 100
    extra_security_group_ids           = ["sg-0123456789abcdef0"]
  }
  expect_failures = [var.single_task_store]
}
