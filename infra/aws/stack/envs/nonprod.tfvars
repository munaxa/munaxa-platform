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

# The whole map (every key is looked up). Config A1: only Identity may run.
desired_counts = {
  identity       = 1
  control-api    = 0
  control-portal = 0
  work-api       = 0
  work-admin     = 0
  school-api     = 0
  school-admin   = 0
  docs-api       = 0
  docs-web       = 0
  docs-scanner   = 0
}

# Docs' API Redis sidecar, the digest Docs Production runs (munaxa-docs launch.auto.tfvars).
docs_redis_image = "public.ecr.aws/docker/library/redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f"

# Images are set by reviewed PRs after each product's "Publish image" run, by digest only.
# Config A1 (Identity only, report 2026-11-09-identity-config-a1-preparation section 5): Identity at
# release 5277d71. Every other image stays unset, so no Control, Work, School or Docs resource exists.
images = {
  identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156"
  identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820"
}

# Identity's cache sidecar: Valkey 8.1.11, linux/amd64 manifest.
valkey_image = "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"

# db-admin's PostgreSQL 16 client: postgres 16.15-bookworm (Docker Official Image), linux/amd64 manifest.
# Only psql runs (entry point sh -c db-bootstrap.sh); no server is started.
postgres_image = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"

# db-admin creates the identity database and its two roles only.
db_bootstrap_products = ["identity"]

# ES256 (P-256). The public half only (owner generator, 9 Nov); the private half is only in
# munaxa-nonprod/identity.
identity_signing_kid = "identity-nonprod-2026-11"
identity_public_keys = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42\\n0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==\\n-----END PUBLIC KEY-----\"}]"

# Bundle version pins (metadata, not secrets): the AWSCURRENT version id of each bundle, supplied by
# the owner on 10 Nov 2026.
secret_version_ids = {
  identity         = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
}
