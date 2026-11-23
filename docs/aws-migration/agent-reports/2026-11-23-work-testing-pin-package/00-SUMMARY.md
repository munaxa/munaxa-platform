# 2026-11-23: Work Testing pin package (MW-002)

Owner package for the first Work stack inputs in Testing. This is the step after the Docs Testing
deployment ([2026-11-23-docs-testing-apply1](../2026-11-23-docs-testing-apply1/)). The audit item is
MW-002 in [2026-11-23-work-launch-readiness-audit](../2026-11-23-work-launch-readiness-audit/).
Labels: **[V]** verified, **[O]** owner action, **[P]** placeholder.

**Status: documentation only. Nothing was applied, published or read from AWS, and no `nonprod.tfvars`
value changed.** The pin PR itself cannot be made yet, because two things are missing:

- **No publishable Work image (MW-001).** `main` CI fails the Images scan on OpenSSL 3.5.9-r1. The
  owner has decided to wait for Alpine OpenSSL 3.5.10 (work#35); the D-SSL exception stays as it
  is and does not cover Work. ECR holds only the withdrawn `b490b25` images, and **their digests
  must never be pinned**.
- **No Work secret values.** `munaxa-nonprod/work-api` and `munaxa-nonprod/work-migrate` have 0
  versions (audit, `DescribeSecret` metadata, 23 Nov).

## What this package fixes in advance

| File | Content |
| --- | --- |
| [01-PIN-PR.md](01-PIN-PR.md) | The exact `envs/nonprod.tfvars` diff, the expected-changes declaration, the E-1 manifest step, the scan basis (permanent Grype gate only) |
| [02-OWNER-STEPS-AND-VERIFICATION.md](02-OWNER-STEPS-AND-VERIFICATION.md) | Owner steps W-1 to W-7 in order, with what Claude verifies after each |
| [supporting/work-pin-mocked.tftest.hcl](supporting/work-pin-mocked.tftest.hcl) | The offline plan of the pin on top of `envs/nonprod.tfvars` (`d2e6fcf`), with placeholder digests and version ids |
| [supporting/work-pin-mocked-output.txt](supporting/work-pin-mocked-output.txt) | Its result: **28 to add, 1 to change (db-admin), 0 to destroy**, with no ECS service |
| [supporting/nonprod.expected-changes.TEMPLATE.json](supporting/nonprod.expected-changes.TEMPLATE.json) | The 29 declared changes. `check-plan-intent.sh --validate` passes |

`infra/aws/stack/tests/work-testing-pin.tftest.hcl` keeps the pin's invariants in CI. With the Work
images and both pins set:

- work-api, work-admin and work-migrate task definitions exist, and no Work ECS service does.
- Each Work task reads its own bundle at the pinned version.
- db-admin reads `WORK_APP_URL` and `WORK_OWNER_URL` at those versions, and reads no Work bundle
  without `work` in `db_bootstrap_products`.
- work-api keeps `LICENSING_MODE=CONTROL_PLANE` and the Identity issuer.

## Local checks [V]

- Stack `terraform test`, including the new file: 97 passed, 0 failed.
- The supporting mocked test with `-var-file=envs/nonprod.tfvars`: 2 passed.
- The declaration template is valid.
- `terraform fmt -check -recursive` passes.

## Cost when applied

Task definitions, roles, security groups and log groups cost nothing while no task runs.
`desired_counts` for work-api and work-admin stay 0 and `services_enabled` stays false, so nothing
starts. A later session adds about US$0.04 an hour for Work (audit file `AWS_TESTING_READINESS.md`).
