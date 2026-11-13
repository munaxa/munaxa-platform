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
# P-5 (report 2026-11-13-identity-testing-stage-r-p5): Identity at 2db6ed9 (identity#20: Platform
# 2.5.0, the security hardening identity#7 to #17, zlib 1.4-r0 for CVE-2026-4738), published by run
# 43359947421; both ECR scans complete with no findings (report
# 2026-11-13-identity-cve-2026-4738-remediation). Never the 5277d71 or 5a5994f images. Every other
# image stays unset, so no Control, Work, School or Docs resource exists.
images = {
  identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b"
  identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874"
}

# Hardened Identity (AW-01; report 2026-11-11-identity-aw01-remediation). Required by the 2db6ed9
# image: under NODE_ENV=production it refuses to start without MFA_ENCRYPTION_KEYS, a primary kid
# that names an entry of it, and IDENTITY_PASSWORD_RESET=disabled (fixed by the stack). The kid is a
# name, not key material: the operator writes the ring entry "mfa-nonprod-2026-11=<key>" into
# munaxa-nonprod/identity (stage C, MFA custody procedure in the P-5 report), and the key never
# appears here. mfa_policy stays "off" in Testing (runbook 2026-11-12-phase-c-d-preparation/03
# P-4) until the privileged accounts' enrolment and recovery procedure exists (munaxa-identity
# docs/production-readiness.md section 6).
identity_security_config = {
  mfa_primary_kid = "mfa-nonprod-2026-11"
  mfa_policy      = "off"
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
# MERGE BLOCKER (P-5): identity must be replaced by the version id that stage C creates (the bundle
# version holding MFA_ENCRYPTION_KEYS), read with describe-secret / list-secret-version-ids, never
# get-secret-value. ad02f18e holds no MFA_ENCRYPTION_KEYS, and ECS refuses to start a task whose
# secret names a JSON key its pinned version lacks. identity-migrate is unchanged: the migrate image
# reads only DATABASE_MIGRATION_URL.
secret_version_ids = {
  identity         = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
}
