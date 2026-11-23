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
  operator    = "operator-test.munaxa.com" # DNS only; ALB operator_cidrs + Identity MFA (../../OPERATOR-ACCESS.md §5)
  work        = "work.test.munaxa.com"
  school      = "school.test.munaxa.com"
  docs        = "docs.test.munaxa.com" # Docs recreated in the shared stack (docs.tf); DNS only
}
certificate_domains = ["*.test.munaxa.com", "operator-test.munaxa.com"]

# The operator network (Control ADR-0006; ../../OPERATOR-ACCESS.md §5). Empty here, and with
# operator_access unset, refuses every request to the operator host. Never commit an operator's
# address: the session workflow passes the aws-nonprod-session variable OPERATOR_CIDRS at up.
operator_cidrs = []

# OPTIONAL Cloudflare Access layer (../../cloudflare-access.md); not used by the Testing deployment
# and not required for Control (21 Nov 2026). Without it, Control needs identity_security_config
# with an MFA policy that covers the Control operator role.
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
# Apply 1 of the first Docs Testing deployment (report 2026-11-23-docs-testing-apply1): Identity at
# 0b94951 (run 45167312831) and Control at 744765d (run 45167349640), published 23 Nov 2026 under the
# TEMPORARY Testing-only OpenSSL exception D-SSL-2026-11 (expires 2026-12-01T00:00:00Z; every digest
# is listed in dssl-exception.tf, so production can never pin it and a Testing `up` is refused after
# the expiry). The 2db6ed9 Identity images are withdrawn. Never the 5277d71 or 5a5994f images. Work,
# School and Docs images stay unset here (Docs follows in Apply 2).
images = {
  identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:b69d9481e43269b5061e3f70a421a41b007bac0d3a0e17b49f8906fe78fd4caa"
  identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:f44593fa3f0021eb301f9270849cc7498012247b50cbf8a5e8dc586f14616462"
  control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:6c79f98ede5159aabae316ad2f29c5e85b99e6bc011265a16da4d75fb44f88f0"
  control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:0ae0db81a6c1eb07068f8bb330379664f15ec3d4cbcadc519cf968082da723a9"
  control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:752fea31c1f0ac6dbcdffc0d5d1bfcd0348eb84e5f7008aad77f645275f64ca6"
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
  mfa_primary_kid      = "mfa-nonprod-2026-11"
  mfa_policy           = "privileged"
  mfa_privileged_roles = ["control-operator-admin", "control-operator-viewer"]
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

# Bundle version pins (metadata, not secrets). identity-migrate: supplied by the owner on 10 Nov 2026.
# identity: the stage C version (report 2026-11-13-identity-stage-c-cli), which adds MFA_ENCRYPTION_KEYS
# (kid mfa-nonprod-2026-11) to the five earlier values; ad02f18e is its AWSPREVIOUS. Supplied by the
# owner from the stage C output and checked with describe-secret metadata only. db-admin is replaced
# with it (its IDENTITY_APP_URL carries this pin), as envs/nonprod.expected-changes.json declares.
secret_version_ids = {
  identity         = "80914756-68cd-420d-8094-0fd49afe3492"
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
}

# Stage E owner decisions (15 Nov 2026, report 2026-11-15-identity-stage-e-owner-decisions, files 04
# and 05). Each is an apply of its own plan, approved after the owner sees the exact plan.
#
# D-B3: the independent Testing session cleanup (session-cleanup.tf): 8 creates and the backstop
# role's policy update. Needs the bootstrap apply with testing_session_cleanup = true (D-B2) first.
session_cleanup_enabled = true

# D-PIN: the Identity session probe (identity-probe.tf), pinned to the commit that merged PR #130
# and the SHA-256 of infra/aws/stack/supporting/identity-session-probe.mjs at it (fetched from
# raw.githubusercontent.com at that commit and hashed, 15 Nov 2026). 1 create. Throwaway mode
# (identity_probe_account default, owner decision D-BE4). envs/nonprod.stage-e-tasks.json probePin
# holds the same two values (test_task_guard.py keeps them equal).
identity_probe_source = {
  commit = "2f6d44317b921d4cf59649285f2481c8bef9fdb0"
  sha256 = "7254a0bade48dcd3d1d3517a0597181967e4b753b6a5b455b26ff48e13a7e369"
}
