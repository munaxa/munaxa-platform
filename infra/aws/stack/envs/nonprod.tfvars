# Testing: on-demand sessions only (owner decision, 29 Oct 2026: <= US$50 a month). Between
# sessions edge_enabled and services_enabled are false and the database is stopped; the session
# workflow turns them on and off. No secret, credential or tenant data in this file.

environment = "nonprod"
account_id  = "229251310592" # until member accounts exist (owner decision pending)
vpc_cidr    = "10.130.0.0/16"

edge_enabled     = false
services_enabled = false

hosts = {
  identity    = "id.test.munaxa.com"
  control_api = "control-api.test.munaxa.com"
  operator    = "operator-test.munaxa.com" # first level: Cloudflare Access proxies it (cloudflare-access.md)
  work        = "work.test.munaxa.com"
  school      = "school.test.munaxa.com"
}
certificate_domains = ["*.test.munaxa.com", "operator-test.munaxa.com"]

# The operator network (Control ADR-0006). Empty refuses every request to the operator host.
operator_cidrs = []

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
}

# Images are set by reviewed PRs after each product's "Publish image" run, by digest only.
images = {}
