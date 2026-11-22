# The D-SSL image exception guard (main.tf). No provider, no AWS call.
variables {
  environment          = "nonprod"
  expires_utc          = "2026-12-01T00:00:00Z"
  now_utc              = "2026-11-25T12:00:00Z"
  sessions_running     = true
  testing_only_digests = ["sha256:1111111111111111111111111111111111111111111111111111111111111111"]
  images = {
    identity_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:1111111111111111111111111111111111111111111111111111111111111111"
    docs_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  }
}

run "testing_before_expiry_is_allowed" {
  command = plan
  assert {
    condition     = output.expired == false && length(output.pinned_testing_only_digests) == 1
    error_message = "Before the expiry Testing may run a Testing-only image."
  }
}

run "testing_last_second_before_expiry" {
  command = plan
  variables { now_utc = "2026-11-30T23:59:59Z" }
}

run "testing_after_expiry_refuses_up" {
  command = plan
  variables { now_utc = "2026-12-01T00:00:00Z" }
  expect_failures = [var.images]
}

run "testing_after_expiry_still_allows_down" {
  command = plan
  variables {
    now_utc          = "2026-12-05T00:00:00Z"
    sessions_running = false
  }
  assert {
    condition     = output.expired
    error_message = "Expired."
  }
}

run "testing_after_expiry_without_testing_only_images_runs" {
  command = plan
  variables {
    now_utc = "2026-12-05T00:00:00Z"
    images  = { docs_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:3333333333333333333333333333333333333333333333333333333333333333" }
  }
}

run "production_with_other_images_plans" {
  command = plan
  variables {
    environment = "prod"
    images      = { docs_api = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:3333333333333333333333333333333333333333333333333333333333333333" }
  }
}

run "production_refuses_a_testing_only_image" {
  command = plan
  variables { environment = "prod" }
  expect_failures = [var.images]
}

run "production_with_no_images_plans" {
  command = plan
  variables {
    environment = "prod"
    images      = {}
  }
}

run "expiry_after_the_hard_cutoff_is_refused" {
  command = plan
  variables { expires_utc = "2026-12-15T00:00:00Z" }
  expect_failures = [var.expires_utc]
}

run "malformed_expiry_is_refused" {
  command = plan
  variables { expires_utc = "1 December 2026" }
  expect_failures = [var.expires_utc]
}

run "unreliable_clock_is_refused" {
  command = plan
  variables { now_utc = "2026-11-01T00:00:00Z" }
  expect_failures = [var.now_utc]
}

run "unparsable_clock_is_refused" {
  command = plan
  variables { now_utc = "tomorrow" }
  expect_failures = [var.now_utc]
}

run "malformed_testing_only_digest_is_refused" {
  command = plan
  variables { testing_only_digests = ["latest"] }
  expect_failures = [var.testing_only_digests]
}
