# 01. The Work Testing pin (26 Nov 2026)

Owner approvals (decision cards, 26 Nov 2026): 12:35 UTC, Work Testing images may use the
Testing-only OpenSSL exception D-SSL-2026-11 (same five findings, expiry 2026-12-01T00:00:00Z, never
production); 12:40 UTC, "Yes, all Work Testing steps" (secrets generated in AWS, pin and apply,
Testing session with Work and demo data).

## Images

| Image | Tag | Digest |
| --- | --- | --- |
| munaxa-work/api | testing-ad96f98 | sha256:2ea322011ab46b4d041ac3c4f35803835f39d1dfa7be282639f81f1485cb6be7 |
| munaxa-work/admin | testing-ad96f98 | sha256:6aee624db2573255b92f487d1e923dd2f3befa1c8266aaab8fac878c10f99517 |
| munaxa-work/migrate | testing-ad96f98 | sha256:ac693b0280c0a82a6923eea417817c70392e204daed3f7669ee13ee47fc1041a |

Published by munaxa-work `publish-images-testing.yml` after green main CI on ad96f98 (work#61 the
Work exception, work#62 a test that asserted which of two concurrent writes wins). Read from ECR
`DescribeImages` (metadata only). All three are listed in `dssl-exception.tf`. The withdrawn
b490b25 Work images are never pinned.

## Bundles

| Bundle | Version | Notes |
| --- | --- | --- |
| munaxa-nonprod/work-migrate | 7e14f855-452c-44b1-98e1-78c5c8b77d50 | DATABASE_MIGRATION_URL (work_owner) |
| munaxa-nonprod/work-api | 2364cb0a-a6c2-4481-a65f-4c7fab374a69 | DATABASE_URL (work_app), PII_MATCH_SECRET; CONTROL_PLANE_TOKEN is the marked placeholder |

Written by the root connector on 26 Nov 2026 12:46 UTC; every password and key generated in AWS by
`GetRandomPassword` and never returned. work-api is pinned again once the owner issues the Work
credential in the Control portal during a session.

## Changes

`nonprod.tfvars`: three Work image digests, two bundle pins, `db_bootstrap_products` adds work,
`work_demo_data_enabled = true`, desired counts work-api and work-admin 1 (used only while a session
is up). E-1 manifest: work-migrate no longer pending, pinned to the same image and version (JSON,
the copy in `e1-task-guard.py`, and `tests/stage-e-manifest.tftest.hcl`).

Declared plan (`nonprod.expected-changes.json`, `check-plan-intent.sh --validate`): 32 creates and
db-admin replaced. A mocked plan of main against this branch (mock provider, no AWS call) gives
exactly these addresses: [supporting/work-pin-mocked-addresses.txt](supporting/work-pin-mocked-addresses.txt)
(the mock shows db-admin in place; a real plan replaces a task definition). No ECS service, ALB,
network, database, KMS, secret, DNS or production change.

Checks: `terraform fmt`, stack tests 105/105, connector tests (task guard 65/65).
