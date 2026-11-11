# Identity probe task definition (Workstream 2)

**Date:** 11 November 2026, 10:08 to 10:30 UTC
**Scope:** repository only. Terraform `fmt`, `validate` and `test` with the mocked AWS provider.
No AWS call, no Terraform plan or apply against AWS, no IAM, DNS, Cloudflare or secret change.
**Owner authorization:** 11 Nov 2026, Workstream 2 (implementation, tests, PR). Merge and
deployment are **not** authorized.
**Closes in code:** pre-authorization review BL-4 (PR #89). The probe no longer needs the
identity-bootstrap task, so it never holds the migration owner's database URL.

## A. Verdict

**READY FOR REVIEW. Not deployed.** The probe task definition exists in code only, behind a pin
that is empty by default, so merging this PR changes no Terraform plan (0 creates; mocked test
`identity_only_config_a1_registers_identity_and_nothing_of_another_product` asserts it). Using it
needs a later configuration PR plus an owner-authorized `aws-terraform.yml` plan and apply of
exactly one create (section F).

## B. Starting evidence

| Item | Value |
| --- | --- |
| `munaxa-platform` base | `main` `49c51f36fb53d1e450c9cf8af58a969897d00623` |
| `munaxa-identity` | `main` `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (image `node:22-alpine`, user `identity`, workdir `/app/apps/api`) |
| Bootstrap task | `infra/aws/stack/ops.tf` 250-292: injects `DIRECT_DATABASE_URL` (migrate bundle), `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` |
| Bootstrap execution role policy | `ops.tf` 209-247: ECR pull of `munaxa-identity/api`; `GetSecretValue` on the identity-migrate bundle and `munaxa-<env>/identity-bootstrap-??????`; KMS decrypt via Secrets Manager; logs to the ops group |
| Identity group | `modules/service`: egress 443 to `0.0.0.0/0`, 5432 to the database group (PR #88 `sgs.json`) |
| ALB group | `edge.tf` 37-53: ingress 80 and 443 from `0.0.0.0/0` |

## C. What was built

Branch `claude/project-thread-h6kr2z` from `49c51f3`.

| File | Change |
| --- | --- |
| `infra/aws/stack/identity-probe.tf` | New. `aws_ecs_task_definition.identity_probe`, count 0 unless Identity is defined **and** `identity_probe_source.commit` is set |
| `infra/aws/stack/scripts/identity-probe-loader.mjs` | New. The task's whole program: pinned download, SHA-256 check, in-memory import |
| `infra/aws/stack/scripts/identity-probe-loader.test.mjs` | New. 18 `node:test` cases, no network |
| `infra/aws/stack/variables.tf` | New variable `identity_probe_source = { commit, sha256 }`, default empty, validated |
| `infra/aws/stack/outputs.tf` | `run_task_network` gains `identity_probe_definition` and `identity_group` |
| `infra/aws/stack/tests/stack.tftest.hcl` | One assertion in the Config A1 run, two new runs (28 tests, was 26) |
| `.github/workflows/aws-terraform.yml` | Static job: `setup-node` (pinned SHA, Node 22) and `node --test 'infra/aws/stack/**/*.test.mjs'` |
| `supporting/` (this folder) | Mocked plan address diff; DRAFT expected-changes and tfvars snippet for the enable PR |

### C.1 The task definition

| Requirement | How it is met | Checked by |
| --- | --- | --- |
| Reuse the Identity API image digest | `image = var.images.identity_api` | Test: image equals the variable |
| Node 22 | That image is `node:22-alpine`; the loader refuses any other major (`node-version`) | Loader test 1; runtime check |
| Read-only root filesystem | `readonlyRootFilesystem = true`; probe is imported from a `data:` URL, never written | Test |
| No `DIRECT_DATABASE_URL`, migration-owner or RDS master credentials | Not in the definition | Test: the JSON contains none of `DATABASE_URL`, `DIRECT_DATABASE_URL`, `DATABASE_MIGRATION_URL`, `MIGRATION`, `rds!`, `identity-migrate`, `REDIS_PASSWORD`, `PRIVATE KEY` |
| Only the operator email and password | `secrets` = exactly `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` from `munaxa-<env>/identity-bootstrap`, same partial-ARN form as `ops.tf` 278-279 | Test: names list equal and both `valueFrom` under that secret |
| Public signing key and organisation as plain values | `PROBE_PUBLIC_KEYS = var.identity_public_keys`, `PROBE_SIGNING_KID`, `PROBE_ORGANISATION = munaxa-group` | Test: the whole environment map is exactly the public set |
| Existing bootstrap execution role, unchanged | `execution_role_arn = aws_iam_role.identity_bootstrap_execution[0].arn`; `ops.tf` not edited | Test; `git diff` shows no change to `ops.tf` |
| No IAM role or policy, no security group, no task role | None declared; no `task_role_arn` | Test; mocked plan diff: exactly one added address (section D) |
| Ops log group, prefix `identity-probe` | `awslogs-group = aws_cloudwatch_log_group.ops.name` (`/munaxa/nonprod/ops`) | Test |
| Probe makes no AWS API call | No task role, so no credential endpoint and no AWS credentials in the container | Test: `task_role_arn` null |
| Not applied | Default pin empty: 0 creates on merge | Config A1 test asserts 0 probe definitions |

Family `munaxa-nonprod-identity-probe`, container `identity-probe`, 256 CPU / 512 MiB, all
capabilities dropped, `skip_destroy = true` like the bootstrap task.

Environment (all public): `NODE_ENV=production`, `PROBE_COMMIT`, `PROBE_SHA256` (informational
copies of the pin), `PROBE_HOST=id.test.munaxa.com`, `PROBE_ISSUER=https://id.test.munaxa.com`,
`PROBE_AUDIENCES=munaxa-work,munaxa-control` (same as Identity's `IDENTITY_AUTH_AUDIENCE`,
`services.tf` 116), `PROBE_ORGANISATION=munaxa-group`, `PROBE_SIGNING_KID`,
`PROBE_PUBLIC_KEYS`, `PROBE_OPERATOR_HOST=operator-test.munaxa.com`,
`PROBE_CONTROL_API_HOST=control-api.test.munaxa.com`, `PROBE_UNKNOWN_HOST=unknown.test.munaxa.com`
(derived from the Identity host's domain). The probe (Workstream 1) refuses to run if any of
these differs from its reviewed constant.

### C.2 Why the execution role does not expose credentials

The execution role is assumed by the ECS agent, not by the container. ECS uses it to pull the
image, resolve the secrets the container definition names, and create the log stream. Its
credentials are never put in the container: only a **task role** is served to the container
(through `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`), and this definition has none.

The role's policy also allows the identity-migrate bundle (for the bootstrap task). That grant is
not reachable from the probe:

- ECS resolves only the `secrets` this container definition names, which are two fields of
  `identity-bootstrap`.
- A `RunTask` container override can change `environment`, `environmentFiles` and `command`, but
  not `secrets`, so the operator cannot add the database URL at run time. `environmentFiles` needs
  `s3:GetObject` on the execution role, which it does not have.
- Getting the migrate bundle would need a new task definition revision, which is a Terraform
  change through review.

### C.3 The loader and the pin

The command is `node --input-type=module -e <loader>`. Terraform writes the reviewed commit and
SHA-256 into two constants of `scripts/identity-probe-loader.mjs` (`__PROBE_COMMIT__`,
`__PROBE_SHA256__`). The pin is therefore part of the reviewed task definition revision. It is
not read from the environment, so a `RunTask` environment override cannot point the loader at
another commit. (Workstream 1 proposed a loader that reads `PROBE_COMMIT` from the environment;
the two threads agreed on this one as the single loader, for that reason.)

The loader:

1. refuses Node other than 22, an unpinned or malformed commit or SHA-256, and a set
   `NODE_TLS_REJECT_UNAUTHORIZED` or `NODE_OPTIONS`;
2. downloads only
   `https://raw.githubusercontent.com/munaxa/munaxa-platform/<commit>/infra/aws/stack/supporting/identity-session-probe.mjs`
   with global `fetch`, certificate checking on, `redirect: 'error'`, 20 s timeout, and a
   256 KiB cap checked while streaming;
3. compares the SHA-256 and, only if it matches, imports the bytes from a `data:` URL (nothing is
   written; the root filesystem is read-only);
4. calls the module's default export with `process.env` and keeps its exit code (0 all pass,
   1 a check failed, 2 configuration; a non-integer becomes 1).

Its own failures print one line, `FAIL probe-source <code>` (codes `node-version`, `commit`,
`sha256-format`, `unsafe-environment`, `download`, `status-<n>`, `too-large`, `checksum`,
`import`, `no-entry`), or `FAIL probe unhandled` if the probe throws, and exit 3. It never prints
a body, a header, an error message or the environment.

Consequence for the probe file: one self-contained module that imports only `node:` built-ins
(a `data:` module cannot import relative paths), does nothing on import, and exports
`default async (env) => exitCode`. Workstream 1 confirmed this contract.

### C.4 How the task is run (input to the runbook, Workstream 4)

- Definition: `run_task_network.identity_probe_definition`.
- Network: `run_task_network.subnets` (public), security group `run_task_network.identity_group`
  (`munaxa-nonprod-identity`), `assignPublicIp = ENABLED`. The probe reaches the ALB's public
  addresses through the internet gateway (ALB ingress 443 is open to `0.0.0.0/0`) and GitHub on
  443. It does not use the database egress.
- The one override: `containerOverrides[name=identity-probe].environment = [{ name =
  "PROBE_ALB_DNS", value = <alb_dns_name> }]`. The ALB is recreated each session, so its name
  cannot be in the definition. No command, secret or other environment override.
- Prerequisite: `munaxa-nonprod/identity-bootstrap` exists with both fields (owner decision
  Option A, Workstream 5). Without it the task fails to start (`ResourceInitializationError`)
  before any code runs.

## D. Tests (offline)

All on this branch, Terraform 1.16.5, `hashicorp/aws` 6.67.0 (lock file hashes verified), Node
22.23.4.

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive infra/aws` | Pass |
| `terraform validate` (stack) | Pass |
| `terraform test` (stack, mocked provider) | **28 passed, 0 failed** (was 26; +2 runs, +1 assertion) |
| `node --test 'infra/aws/stack/**/*.test.mjs'` | **18 passed, 0 failed** |
| `prettier --check` (2.8.8, repo config) on the new `.mjs` and `.json` files | Pass |
| Mocked plan address diff, Config A1 vs Config A1 + pin (`terraform test -verbose`) | 86 vs 87 creates; only addition `aws_ecs_task_definition.identity_probe[0]`; nothing removed (`supporting/mocked-plan-addresses.txt`) |

The 86 is the mocked plan from an empty state, not the live plan. Against the live state (Config
A1 applied, 10 Nov), the enable PR's plan is expected to be exactly one create. That is a
prediction until the owner-authorized plan shows it.

New Terraform runs:

- `identity_probe_is_isolated_from_database_credentials`: family; execution role is the bootstrap
  role; no task role; no new role, policy or group; secrets exactly the two operator fields;
  no database, migrate, RDS, Redis or private-key reference anywhere in the JSON; image, read-only
  root, capabilities; log group and prefix; the exact environment map; the command is the loader
  with the pin written in, no placeholder and no `rejectUnauthorized`; the outputs.
- `identity_probe_pin_must_be_a_full_commit_and_sha256`: a short commit is refused.

Loader tests (fetch stubbed, each case runs the loader the way the task does): success path and
the exact URL and options; probe exit codes kept; non-integer return; `node:` imports from the
`data:` module; ten refusals each printing exactly one line and exiting 3; a tampered probe is
never imported; a throwing probe prints one line and not its message; the loader text never
disables certificate checks or prints the environment.

CI: the PR runs `aws-terraform.yml` static job (fmt, validate, mocked tests, and now the Node
tests) and `ci.yml`. Results are in the PR checks.

## E. Not covered, and risks

| Id | Risk or limit | Handling |
| --- | --- | --- |
| W2-1 | Not applied, so the definition has never been registered by AWS. ECS may still reject something the mock accepts | The enable apply is the test; any rejection fails the plan or apply before a session |
| W2-2 | Enabling needs its own Terraform apply (1 create) while the session is down; `aws-session.yml` refuses task definition changes | Section F. A separate owner authorization |
| W2-3 | Whoever calls `RunTask` (root, through the connector) can still override `command` and run any code in this container with the two operator values | Runbook: the only override is `PROBE_ALB_DNS`; CloudTrail `RunTask` records `overrides`; the evidence step should show them. No database credential is reachable either way (C.2) |
| W2-4 | The identity group allows 5432 to the database. The probe holds no database credential, so it cannot sign in | Accepted; no group change is in scope |
| W2-5 | `raw.githubusercontent.com` must be reachable from the task and the repository must stay public. A 200 for a raw file of this repo was seen through this session's proxy (10:12 UTC), which does not prove what the task sees | A failure is `FAIL probe-source download` or `status-<n>`, nothing leaks |
| W2-6 | The SHA-256 protects the content; trust in the content rests on the PR review of that commit | The pin must be a commit on `main` after review |
| W2-7 | The loader's header comments (about 1 KB) are part of the registered command | Kept on purpose, so the registered text explains itself; container definitions allow 64 KiB |
| W2-8 | The secret ARN is partial (no random suffix), as in `ops.tf`; a recreated secret of that name is picked up | Intended (one-run secret recreated per session) |
| W2-9 | The README index row for this report is not added here | Workstream 4 adds all five rows in one consolidated index PR, to avoid conflicting "Latest" rows |
| W2-10 | Node tests run in CI only from this PR on; earlier CI never ran `.mjs` tests | New step in the static job |

## F. Enabling it later (not authorized now)

1. Merge the probe PR (Workstream 1) after review; note its `main` commit.
2. A configuration PR sets `identity_probe_source` in `envs/nonprod.tfvars`
   (`supporting/nonprod.tfvars.probe-snippet.DRAFT`) and replaces
   `envs/nonprod.expected-changes.json` with exactly one create,
   `aws_ecs_task_definition.identity_probe[0]` (`supporting/nonprod.expected-changes.probe.DRAFT.json`).
3. Owner-authorized `aws-terraform.yml` `nonprod` `plan`, read, then `apply`; post-apply plan
   shows no changes.
4. Only then a session `up`, and the probe run per the runbook.

## G. Merge order

This PR is independent of #87, #88, #89 and the other workstream PRs: it touches no file they
touch, except that the README index is left to Workstream 4. Suggested order is in Workstream 4's
consolidated index PR. Nothing here may be merged without the owner's words.
