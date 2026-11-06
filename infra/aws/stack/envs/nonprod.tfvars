# Testing: on-demand sessions only (owner decision, 29 Oct 2026: <= US$50 a month). Between
# sessions edge_enabled and services_enabled are false and the database is stopped; the session
# workflow turns them on and off. No secret, credential or tenant data in this file.

environment = "nonprod"
account_id  = "229251310592" # until member accounts exist (owner decision pending)
vpc_cidr    = "10.130.0.0/16"

edge_enabled     = false
services_enabled = false

# Testing's AWS-side shutdown backstop (backstop.tf): every day at 21:00 UTC, EventBridge Scheduler
# stops the database and scales every service to 0. It was off for G3 (owner decision D-4 = B,
# phase 7); this is its separate apply after G3 (13 creates, nonprod readiness phase, 6 Nov 2026).
# No Testing session starts before its first run is verified (report 2026-11-06-nonprod-readiness).
session_backstop_schedule = "cron(0 21 * * ? *)"

hosts = {
  identity    = "id.test.munaxa.com"
  control_api = "control-api.test.munaxa.com"
  operator    = "operator-test.munaxa.com" # first level: Cloudflare Access proxies it (cloudflare-access.md)
  work        = "work.test.munaxa.com"
  school      = "school.test.munaxa.com"
  docs        = "docs.test.munaxa.com" # Docs recreated in the shared stack (docs.tf); DNS only
}
certificate_domains = ["*.test.munaxa.com", "operator-test.munaxa.com"]

# The operator network (Control ADR-0006). Empty, and with operator_access unset, refuses every
# request to the operator host.
operator_cidrs = []

# Cloudflare Access (../../cloudflare-access.md). Set once the Access application exists; the team
# domain and AUD tag are public. Required before any Control image is set.
# operator_access = { team_domain = "https://<team>.cloudflareaccess.com", audience = "<AUD tag>" }

database_backup_retention_days = 7
database_deletion_protection   = true
log_retention_days             = 14

desired_counts = {
  identity       = 1
  control-api    = 1
  control-portal = 1
  work-api       = 1
  work-admin     = 1
  school-api     = 1
  school-admin   = 1
  docs-api       = 1
  docs-web       = 1
  docs-scanner   = 1
}

# Docs' API Redis sidecar, the digest Docs Production runs (munaxa-docs launch.auto.tfvars).
docs_redis_image = "public.ecr.aws/docker/library/redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f"

# Images are set by reviewed PRs after each product's "Publish image" run, by digest only.
images = {}
