# The service module's listener rules (main.tf): the optional per-route method condition is
# rendered when a route names methods and absent when it does not, and method names are validated
# (variables.tf). Mocked AWS provider: no credentials, no AWS call.
#
#   terraform init -backend=false && terraform test -filter=tests/routes.tftest.hcl

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}"
    }
  }
}

variables {
  prefix                = "munaxa-test"
  name                  = "svc"
  region                = "eu-central-1"
  account_id            = "229251310592"
  image                 = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-test/svc@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  port                  = 3000
  cluster_arn           = "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-test"
  vpc_id                = "vpc-0123456789abcdef0"
  subnet_ids            = ["subnet-0123456789abcdef0"]
  routed                = true
  admit_alb             = true
  alb_security_group_id = "sg-0bbbbbbbbbbbbbbbb"
  listener_arn          = "arn:aws:elasticloadbalancing:eu-central-1:229251310592:listener/app/munaxa-test/0123456789abcdef/0123456789abcdef"
  routes = [
    { priority = 49, hosts = ["work.test.example"], paths = ["/health/ready"], methods = ["GET"] },
    { priority = 51, hosts = ["work.test.example"], paths = ["/api/v1/*"] },
  ]
}

run "a_route_with_methods_renders_the_method_condition" {
  command = plan

  assert {
    condition = (
      length([for c in aws_lb_listener_rule.this["49"].condition : c if length(c.http_request_method) > 0]) == 1
      && join(",", flatten([for c in aws_lb_listener_rule.this["49"].condition : [for m in c.http_request_method : tolist(m.values)]])) == "GET"
    )
    error_message = "Rule 49 carries exactly one http_request_method condition, GET."
  }
  assert {
    condition     = join(",", flatten([for c in aws_lb_listener_rule.this["49"].condition : [for p in c.path_pattern : tolist(p.values)]])) == "/health/ready"
    error_message = "Rule 49 keeps its exact path."
  }
  assert {
    condition     = join(",", output.listener_rule_hosts["49"]) == "work.test.example"
    error_message = "listener_rule_hosts reports the rendered host."
  }
}

run "a_route_without_methods_has_no_method_condition" {
  command = plan

  assert {
    condition     = length([for c in aws_lb_listener_rule.this["51"].condition : c if length(c.http_request_method) > 0]) == 0
    error_message = "A route without methods matches any method: no http_request_method condition."
  }
  assert {
    condition     = length(aws_lb_listener_rule.this["51"].condition) == 2
    error_message = "Rule 51 renders only its host and path conditions."
  }
}

run "a_lower_case_method_is_refused" {
  command = plan

  variables {
    routes = [{ priority = 49, hosts = ["work.test.example"], paths = ["/health/ready"], methods = ["get"] }]
  }

  expect_failures = [var.routes]
}

run "an_unknown_method_is_refused" {
  command = plan

  variables {
    routes = [{ priority = 49, hosts = ["work.test.example"], paths = ["/health/ready"], methods = ["FETCH"] }]
  }

  expect_failures = [var.routes]
}
