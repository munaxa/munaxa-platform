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

# The whole map (every key is looked up). Only used while a session is up (services exist only
# then). Y-8 Docs session (report 2026-11-22 file 05 step 20): Identity, Control API and the three
# Docs services, plus the Control portal (24 Nov 2026): Control refused the first Docs credential
# (401), so the owner revokes it and issues a new one in the portal during this session.
desired_counts = {
  identity       = 1
  control-api    = 1
  control-portal = 1
  work-api       = 0
  work-admin     = 0
  school-api     = 0
  school-admin   = 0
  docs-api       = 1
  docs-web       = 1
  docs-scanner   = 1
}

# Docs' API Redis sidecar, the digest Docs Production runs (munaxa-docs launch.auto.tfvars).
docs_redis_image = "public.ecr.aws/docker/library/redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f"

# Images are set by reviewed PRs after each product's "Publish image" run, by digest only.
# Apply 1 of the first Docs Testing deployment (report 2026-11-23-docs-testing-apply1): Identity at
# 0b94951 (run 45167312831) and Control at 744765d (run 45167349640), published 23 Nov 2026 under the
# TEMPORARY Testing-only OpenSSL exception D-SSL-2026-11 (expires 2026-12-01T00:00:00Z; every digest
# is listed in dssl-exception.tf, so production can never pin it and a Testing `up` is refused after
# the expiry). The 2db6ed9 Identity images are withdrawn. Never the 5277d71 or 5a5994f images. Work,
# School images stay unset here.
# Apply 2 (report 2026-11-23-docs-testing-apply1): Docs at 9348aab (run 45167367972), also published
# 23 Nov under D-SSL-2026-11 (api, web, migrate listed in dssl-exception.tf); the antivirus image passed
# the permanent gate alone. The Docs worker image is not part of this release.
# Identity re-pin 24 Nov 2026: Identity at 6dbf35d (run 45359411701, identity#28: same-origin referrer
# policy, so a browser's sign-in form keeps its Origin), also under D-SSL-2026-11 and listed.
images = {
  identity_api     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:98d494ed016e6702e2bd4fee1533be0d672fcb322a14ea8cc6b4287d8324de1f"
  identity_migrate = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:726ace441fd4a520c01ef3a92162059c92fc6ac267c83e627c62eb85990cc032"
  control_api      = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/api@sha256:6c79f98ede5159aabae316ad2f29c5e85b99e6bc011265a16da4d75fb44f88f0"
  control_migrate  = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/migrate@sha256:0ae0db81a6c1eb07068f8bb330379664f15ec3d4cbcadc519cf968082da723a9"
  control_portal   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-control/portal@sha256:752fea31c1f0ac6dbcdffc0d5d1bfcd0348eb84e5f7008aad77f645275f64ca6"
  docs_api         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/api@sha256:febeaca7bb1e58b261677c30cc4aabeec7d00896b40155f89ead903597be073d"
  docs_web         = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/web@sha256:28e22b96ada6237abef4f53470c1d13723bb70931ae8dfa774df8d536cbb48cd"
  docs_antivirus   = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/antivirus@sha256:801c77e1560ec63430463346810c83527a5183982e94cc82950cbbed3f015dfc"
  docs_migrate     = "229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/migrate@sha256:4d00650b9759a64889cf2c95a3c10cb508787737af2d69aff64c23ba56e66ae8"
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

# db-admin creates the identity and control databases and their roles (Apply 2, C-2). Docs has its own
# docs-db-admin task.
db_bootstrap_products = ["identity", "control"]

# Control C-2 (Apply 2). The licence public key is the public half of the KMS key aws_kms_key.licence
# created by Apply 1 (alias/munaxa-nonprod-control-licence), read with kms:GetPublicKey as
# MunaxaReadOnly; the private half never leaves KMS. Operator identifiers are ids, not secrets.
control_licence_kid              = "control-licence-nonprod-2026-11"
control_licence_public_key       = "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEkgQnIqd/K/RL9xq0h9+EcR0ogRKN\nLwL56mPJSDr1GEl5BiafDGaQxzPzsNSVYnY3cd1qpv4shZY5O+QSOYL+Yg==\n-----END PUBLIC KEY-----"
control_operator_organisation_id = "071d3060-70ac-4017-9ff9-094ff715051e"
control_operator_subjects        = ["ae62eef5-cf65-43c8-83e2-7786d2d5ae87"]

# ES256 (P-256). The public half only (owner generator, 9 Nov); the private half is only in
# munaxa-nonprod/identity.
identity_signing_kid = "identity-nonprod-2026-11"
identity_public_keys = "[{\"kid\":\"identity-nonprod-2026-11\",\"publicKey\":\"-----BEGIN PUBLIC KEY-----\\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1PulSDhEOvX3B61NzQwO20+q4+42\\n0KcstlgmQccrRJy+byuVwhz2HiJp1itFmUBkugYOR087NqwNr2Kowk5fRQ==\\n-----END PUBLIC KEY-----\"}]"

# Bundle version pins (metadata, not secrets). identity-migrate: supplied by the owner on 10 Nov 2026.
# identity: the stage C version (report 2026-11-13-identity-stage-c-cli), which adds MFA_ENCRYPTION_KEYS
# (kid mfa-nonprod-2026-11) to the five earlier values; ad02f18e is its AWSPREVIOUS. Supplied by the
# owner from the stage C output and checked with describe-secret metadata only. db-admin is replaced
# with it (its IDENTITY_APP_URL carries this pin), as envs/nonprod.expected-changes.json declares.
# Apply 2: the five bundles filled by the owner on 22 Nov 2026 (report 2026-11-22-testing-temporary-
# openssl-acceptance file 02 section 3, metadata only). docs-api pinned again on 24 Nov 2026 (runbook
# step 19): the owner issued the Docs Control Plane credential in the Control portal and stored it with
# docs-testing-secrets.sh replace-key CONTROL_PLANE_TOKEN; only the version id was sent (report
# 2026-11-24-control-session-y6). docs-api and docs-provision are replaced with it.
secret_version_ids = {
  identity         = "80914756-68cd-420d-8094-0fd49afe3492"
  identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
  control-api      = "655501d8-19f2-4190-9460-960b6464a1a2"
  control-migrate  = "ee66de8e-9ab8-4f72-8db8-11c631c1e0e0"
  docs-api         = "0250d083-7ebc-4ca3-8efe-97c14f0b677a"
  docs-operator    = "85c17e64-1cec-4edd-80a2-59c5c06306d5"
  docs-migrate     = "b9b569c4-c9d7-49ae-935f-a59ee4da6a14"
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
