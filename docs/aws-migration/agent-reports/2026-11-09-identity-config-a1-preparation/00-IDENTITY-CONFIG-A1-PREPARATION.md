# Identity-only Testing deployment preparation (Config A1)

- **Date:** 9 Nov 2026, from 12:46 UTC. **Thread:** "Prepare Identity-only Testing deployment (Config A1)".
- **Brief:** the owner's "Prepare Munaxa Identity-Only Testing Deployment (Config A1)", 9 Nov 2026 12:46 UTC. Repository inspection, analysis, documentation, local tests and a proposed Config A1 implementation only.
- **Starting point:** platform `main` = `646b7b8` (PR #66). Previous report: [`../2026-11-08-first-testing-release-preparation/`](../2026-11-08-first-testing-release-preparation/00-FIRST-TESTING-RELEASE-PREPARATION.md) at `88cba385200041a30881253ae4f74fcf1524334b` on PR #67 (open, not merged). Access policy: [`infra/aws/ACCESS-POLICY.md`](../../../../infra/aws/ACCESS-POLICY.md).
- **AWS in this task: no AWS call succeeded.** The root-connected AWS connector returned "needs you to sign in again" at about 12:55 UTC and again on a retry later in the task; the owner was asked to reconnect it. Every AWS fact below is either from the 8 Nov report (labelled [V-prior]) or from GitHub job logs read today. Nothing was written to AWS.
- **Labels:** [V-repo] code at the commits named; [V-gh] GitHub read in this task; [V-reg] public container registry read in this task (manifest digests verified by hashing the manifest bodies); [V-src] image build source read in this task; [V-local] local Terraform or Node run in this task, no AWS; [V-prior] earlier report, not re-read; [E] inference.

| File | Content |
|---|---|
| this file | Deliverables: state, Terraform change, declaration, images, inputs, secrets, key, IAM, checklist, risks, boundary |
| [`01-OWNER-INPUT-GUIDE.md`](01-OWNER-INPUT-GUIDE.md) | Exact Windows PowerShell and console steps for every owner value |
| [`02-IDENTITY-ONLY-RUNBOOK.md`](02-IDENTITY-ONLY-RUNBOOK.md) | Identity-only deployment and first-session runbook (not approved, not run) |
| [`supporting/identity-a1-owner-values.mjs`](supporting/identity-a1-owner-values.mjs) | Owner-side generator: signing key and Identity bundle values, never printed (sha256 `f7292ed5…8cde`) |
| [`supporting/nonprod.config-a1.tfvars.TEMPLATE`](supporting/nonprod.config-a1.tfvars.TEMPLATE) | The A1 lines for `envs/nonprod.tfvars`: verified digests, placeholders for the public key and version ids |
| [`supporting/nonprod.expected-changes.config-a1.DRAFT.json`](supporting/nonprod.expected-changes.config-a1.DRAFT.json) | The Config A1 declaration (22 creates), for `envs/nonprod.expected-changes.json` in the inputs PR |
| [`supporting/config-a1-mocked.tftest.hcl`](supporting/config-a1-mocked.tftest.hcl) | Mocked plans: baseline applied first, then A1, then a session `up` |
| [`supporting/config-a1-mocked-plan-addresses.txt`](supporting/config-a1-mocked-plan-addresses.txt) | Address lists and deltas from those runs |
| [`supporting/image-selection-evidence.txt`](supporting/image-selection-evidence.txt) | Registry and source evidence for the Valkey and PostgreSQL images |

---

## 1. Summary and verdict

### Verdict: NOT READY FOR ACTUAL PLAN REVIEW. Ready on the code side; three owner inputs and one read-only re-check stand between this and a real plan.

| Area | Status |
|---|---|
| Config A1 code (this PR) | **Ready.** One-line count change keeps Docs' `db-admin` task definition out of A1; a new test proves it (fails on the old code, passes on the new) |
| Declaration | **Ready (mocked).** 22 creates, 0 updates, 0 destroys, planned on top of an applied mocked baseline. Report #67's 23 minus `docs_db_admin` |
| Identity image digests | **Verified from GitHub job logs today** (both match the 8 Nov ECR read-back). ECR not re-read (connector) |
| Valkey image | **Selected and verified:** `valkey/valkey` 8.1.11, linux/amd64 manifest by digest on ECR Public, identical on Docker Hub |
| PostgreSQL client image | **Selected and verified:** official `postgres` 16.15-bookworm, linux/amd64 manifest by digest on ECR Public (§5.3) |
| Signing key | **Owner action.** The repository script prints the private key, so it is not used as is; a tested generator that never prints a secret replaces it (§8) |
| Secret bundles | **Owner action.** Exact inventory in §7; values generated on the owner's PC and pasted into Secrets Manager |
| Fresh AWS state | **NOT VERIFIED today** (connector sign-in expired). Last evidence 8 Nov 10:41 UTC [V-prior] |
| Deployer IAM for A1 | **NOT VERIFIED** (never exercised; §9). The first apply stops on any `AccessDenied` |

**Blockers for "ready for actual plan review", exactly:**

1. **B-1** Owner: reconnect the AWS connector and authorize the read-only re-check of runbook step 3 (or run it in CloudShell). Without it the G3 state, RDS status and backstop are 8 Nov evidence only.
2. **B-2** Owner: guide part A (key and the two bundles in Secrets Manager), then part B (public snippet and the two version ids into the thread).
3. **B-3** Inputs PR (Claude, after B-2): the template lines in `envs/nonprod.tfvars` and the declaration in `envs/nonprod.expected-changes.json`, merged by the owner.
4. **B-4** This preparation PR merged (the dispatch plan runs on `main` only).

After B-1 to B-4 the owner dispatches `aws-terraform.yml` nonprod `plan`, and the plan is reviewed against §4.

---

## 2. Current state (observed 9 Nov 2026, UTC)

### 2.1 Repositories [V-gh, V-repo]

| Item | Observed (time) | Effect on A1 |
|---|---|---|
| Platform `main` | `646b7b8` (12:47), unchanged since 8 Nov 07:3x | Report #67's mocked counts were computed on this commit: still valid |
| PR #67 | Open, not merged, `mergeable_state: clean`, head `88cba385…` (12:47) | Its report is not on `main`; this report links to it on its branch |
| Identity `main` | `5277d7190b3dda496443c4bd7d80c78bd4d9174e` (12:49), the published release commit | Images at this commit are the A1 images |
| `infra/aws` since `646b7b8` | No commit | No change affects A1 |
| Identity publish run 42466697538, attempt 2 | Job 128690908234 pulled back `munaxa-identity/api@sha256:71d01fdf…8c156`; job 128690908425 pulled back `munaxa-identity/migrate@sha256:d175ef37…20820` (logs read about 13:00) | Digests confirmed |

### 2.2 AWS (not re-read today)

The connector failed with a sign-in error before any call, so none of items 4.5 to 4.8 of the brief
could be checked today. The last observations, all 8 Nov [V-prior, report #67 §5.1, §13, §15]:

| Check | Last value | Observed |
|---|---|---|
| Caller | `arn:aws:iam::229251310592:root` | 07:57 |
| ECR `munaxa-identity/api`, `/migrate` | 1 image each, IMMUTABLE; digests as §2.1 | 09:37 |
| All 8 product repositories | 1 image each | 10:41 |
| RDS `munaxa-nonprod-pg` | stopped, 16.13, db.t4g.micro, not public, deletion protection on | 07:57 |
| ECS `munaxa-nonprod` | 0 services, 0 tasks, 0 task-definition families | 07:58 |
| ALB, NAT, EIP, EC2 | 0 | 07:58 |
| Backstop | 11 schedules ENABLED | 07:58 |
| Secrets `munaxa-nonprod/*` | 10 containers, 0 versions | 07:57 |
| CloudTrail write events (26 h) | no AccessDenied | 07:58 |
| ACM | ISSUED (read 8 Nov 06:54) | 06:54 |

[E] Expected now: RDS still stopped (AWS restarts a stopped instance after 7 days, about 13 Nov
16:18 UTC), backstop runs at 21:00 UTC on 8 Nov as before. **Not verified.** Runbook step 3 is the
re-check, metadata only (`Describe*`, `List*`, `LookupEvents`), before the inputs PR.

---

## 3. Config A1 Terraform change (this PR)

### 3.1 Why Docs' task definition appeared

`aws_ecs_task_definition.docs_db_admin` had `count = local.docs_enabled && var.postgres_image != ""`
(`stack/docs.tf`). `docs_enabled` is `hosts.docs != null`, and `envs/nonprod.tfvars` sets
`hosts.docs`. So setting `postgres_image` for the products' `db-admin`, which A1 needs, also
registered Docs' run-only task definition [V-repo, V-local].

### 3.2 The change

```hcl
resource "aws_ecs_task_definition" "docs_db_admin" {
  count = local.docs_defined && var.postgres_image != "" ? 1 : 0
```

`docs_defined` is `docs_enabled` plus every Docs image and the Redis image set, the same condition
`docs-provision` and the Docs services already use. Docs' database bootstrap runs only when Docs is
deployed, so nothing that worked before stops working.

Not changed: `aws_iam_role.docs_db_admin_execution` and its policy keep following `hosts.docs`
(they exist in AWS since G3, so changing their condition would destroy them); the Docs bundles,
bucket and every other Docs resource; outputs (`docs_db_admin_definition` is already null-safe).

### 3.3 Tests [V-local]

Terraform 1.16.5 and AWS provider 6.67.0 from releases.hashicorp.com (zip sha256 `2bc2fcff…b5e4`
and `4ce94853…7f63`, both equal to HashiCorp's SHA256SUMS), through a filesystem mirror.

| Check | Result |
|---|---|
| `terraform fmt -check -recursive infra/aws` | clean |
| `terraform validate` bootstrap and stack | valid |
| `terraform test` bootstrap | 12 passed |
| `terraform test` stack, before the change | 25 passed |
| `terraform test` stack, after the change | **26 passed** (new run `identity_only_config_a1_registers_identity_and_nothing_of_another_product`) |
| New run against the old `docs.tf` | **fails** on "Config A1 registers no Docs task definition" (the test detects the defect) |
| Existing `docs_runs_in_a_session_with_its_bucket_bundles_and_tasks` | still passes: with Docs defined, `docs_db_admin` is registered |
| `check-plan-intent.sh --validate` on the A1 declaration | "Declaration valid: root stack-nonprod, 22 declared change(s)" |
| Mocked A1 runs (`supporting/config-a1-mocked.tftest.hcl`, `-var-file=envs/nonprod.tfvars`) | 4 passed |
| The template merged into `envs/nonprod.tfvars` (test public key and version ids) | plans with A1 only; a session `up` passes every `variables.tf` validation (2 passed) |
| Generator's public snippet read by Terraform | `jsondecode` gives the kid and a `BEGIN PUBLIC KEY` PEM; no `PRIVATE KEY` |

The new test asserts: Identity, `migrate["identity"]`, `identity-bootstrap` and `db-admin`
registered; no `docs_db_admin`, `docs_provision` or Docs service; the G3 Docs execution role kept;
no Control resource or licence key; no Work or School resource; only Identity routed; no ECS
service with services off.

**Not run locally:** `shellcheck` on `db-bootstrap.sh` (unchanged, CI runs it); the Identity
repository's own test suite (it needs the private `@munaxa/*` packages; nothing in Identity
changed). The generator's key format was checked with the same Node calls Identity uses
(`createPublicKey` on the private PEM), §8.3.

**A mocked provider proves nothing about AWS permissions and is not an AWS plan.**

---

## 4. Config A1 resource declaration

### 4.1 Expected creates (22)

From the mocked plan run on top of an applied mocked baseline (`envs/nonprod.tfvars` as on main),
so in-place updates would have been shown too: **22 to add, 0 to change, 0 to destroy** [V-local].

| Group | Addresses | n |
|---|---|---|
| Identity service (`module.identity[0]`) | `aws_ecs_task_definition.this`, `aws_iam_role.execution`, `aws_iam_role_policy.execution`, `aws_cloudwatch_log_group.this`, `aws_security_group.this`, `aws_vpc_security_group_egress_rule.https`, `aws_vpc_security_group_egress_rule.database[0]`, `aws_vpc_security_group_ingress_rule.database_from_service[0]`, `aws_vpc_security_group_ingress_rule.from_alb[0]` | 9 |
| Identity migration (`module.migrate["identity"]`) | `aws_ecs_task_definition.this`, `aws_iam_role.execution`, `aws_iam_role_policy.execution`, `aws_cloudwatch_log_group.this`, `aws_security_group.this`, `aws_vpc_security_group_egress_rule.https`, `aws_vpc_security_group_egress_rule.database[0]`, `aws_vpc_security_group_ingress_rule.database_from_service[0]` | 8 |
| Identity bootstrap | `aws_ecs_task_definition.identity_bootstrap[0]`, `aws_iam_role.identity_bootstrap_execution[0]`, `aws_iam_role_policy.identity_bootstrap_execution[0]` | 3 |
| Database administration | `aws_ecs_task_definition.db_admin[0]` (its role, policy, security group and rules exist since G3) | 1 |
| ALB to Identity | `aws_vpc_security_group_egress_rule.alb_to_service["identity"]` (a rule on the existing ALB group; the ALB itself is created only by a session) | 1 |

Full list: `supporting/nonprod.expected-changes.config-a1.DRAFT.json`. Difference from report #67's
23: `aws_ecs_task_definition.docs_db_admin[0]` removed (§3).

Two of the rules are added to existing security groups (`database_from_service` on the database
group, `alb_to_service` on the ALB group). Adding a separate rule resource is a create; it does not
modify or replace either group.

### 4.2 Not in A1, for the record

- **A session `up` after A1** adds 11 resources, all of types the session workflow allows:
  `aws_lb.main[0]`, `aws_lb_listener.http[0]`, `aws_lb_listener.https[0]`,
  `aws_acm_certificate_validation.main[0]`, `aws_lb_listener_rule.control_admin_refused[0]`,
  `.control_api_refused[0]`, `.operator_refused[0]`, `module.identity[0].aws_lb_target_group.this[0]`,
  `.aws_lb_listener_rule.this["40"]`, `.aws_lb_listener_rule.this["50"]`, `.aws_ecs_service.this[0]` [V-local].
- **The real plan may add `~ update` lines that a mock cannot show** (provider-normalized attributes
  of existing resources). None appeared in the mock. Any such line is a stop condition until explained.
- The real plan will show the 22 task definitions' contents with real ARNs; only addresses and
  actions are compared by `check-plan-intent.sh --enforce`.

### 4.3 Automatic stop conditions for the real plan

Stop, and do not normalize the declaration, if the plan shows: any change, replacement or destroy
of `aws_db_instance.main`, its parameter or subnet group; any VPC, subnet, route table, internet
gateway or security group (`aws_security_group.*`) change or replacement; any ACM resource; any
`aws_scheduler_schedule.*` or `session_backstop` change; any `prod` address; any Control, Work,
School or Docs address (including `docs_db_admin`); any IAM change other than the four new
execution roles and their inline policies; any address not in the 22; any destroy or replacement.
Every difference is explained in the thread first, and the declaration changes only by a reviewed PR.

---

## 5. Images

### 5.1 Identity (ECR, this account)

| Input | Value | Evidence |
|---|---|---|
| `images.identity_api` | `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156` | Job 128690908234 log, pulled back by digest 8 Nov 09:34:54 [V-gh today]; ECR read-back 8 Nov 09:37 [V-prior] |
| `images.identity_migrate` | `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820` | Job 128690908425 log, 09:35:21 [V-gh today]; ECR 8 Nov [V-prior] |

Both match `variables.tf`'s pattern; both repositories are IMMUTABLE, so the tags cannot be moved
[V-prior]. Built by the release workflow on `ubuntu-latest` (linux/amd64), matching every task
definition's `cpu_architecture = "X86_64"`.

### 5.2 Valkey (Identity's cache sidecar)

**Selected: `public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e`**
(Valkey 8.1.11, linux/amd64).

| Criterion | Evidence |
|---|---|
| Trusted publisher | The Valkey project's own image (`valkey-io/valkey-container`, Linux Foundation), on ECR Public `valkey/valkey` and Docker Hub `valkey/valkey`. There is no Docker Official `library/valkey` (ECR Public `docker/library/valkey` answers 404 [V-reg]), as `variables.tf` already notes |
| Compatible with Terraform and Identity | `variables.tf` accepts `public.ecr.aws/valkey/valkey@sha256:<64 hex>`. The sidecar runs `sh -c`, `printf`, `valkey-server <conf> --bind 127.0.0.1 ...` as user `999:999` and checks health with `valkey-cli`: the image is Debian `trixie-slim` (has `sh`), creates `valkey` with uid and gid **999**, installs `valkey-server` and `valkey-cli` (build source checks `valkey-cli --version`) [V-src, valkey-container `e3be9b56` `8.1/debian/Dockerfile`]. Identity uses ioredis with `PING` and ordinary keys, which Valkey 8.1 serves (Redis 7.2 protocol compatible) [V-repo `cache.ts`] |
| Architecture | Index lists linux/amd64, arm64, arm/v7, ppc64le; the pinned digest is the **linux/amd64** manifest, so ECS can only pull the x86_64 image [V-reg] |
| Stable | 8.1.11 is the current patch of the 8.1 line (`versions.json`: 8.1.11, 9.0.7, 9.1.3, 9.2.0-rc2) [V-src]; image created 27 Oct 2026 [V-reg, Docker Hub config]. 8.1 chosen over 9.x: the newest mature line with no feature Identity needs from 9.x, and the line the 8 Nov plan named |
| Immutable digest | The amd64 manifest body hashes to the digest on both ECR Public and Docker Hub; config digest `sha256:ca662989…04eb3` identical on both [V-reg] |

### 5.3 PostgreSQL client (the `db-admin` task)

**Selected: `public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e`**
(PostgreSQL 16.15, Debian bookworm, linux/amd64).

| Criterion | Evidence |
|---|---|
| Trusted publisher | Docker Official Image `postgres`, mirrored by AWS at `public.ecr.aws/docker/library/postgres`, the only path `variables.tf` accepts. Tag `16.15-bookworm` is built from docker-library/postgres `9d15534160ade17f2b6c455a39ee967c49b1937d` `16/bookworm` (library manifest) [V-src] |
| PostgreSQL 16 | `PG_MAJOR 16`, `PG_VERSION 16.15-1.pgdg12+2` [V-src]. RDS runs 16.13 [V-prior]; a 16.15 `psql` talks to any 16.x server |
| Utilities the scripts need | `db-bootstrap.sh` uses `sh`, `printenv`, `printf`, `sed`, `grep -E`, `tr` and `psql` with `\getenv` (psql 15+), `\if` and `\gset`; Docs' `db-admin` (not in A1) uses `printf` and `psql`. Debian bookworm-slim provides `dash` as `sh`, coreutils, sed and grep; the image installs `postgresql-16`, whose `psql` 16 has all three meta-commands; `PATH` includes `/usr/lib/postgresql/16/bin` [V-src] |
| User `999:999` | The image creates `postgres` with uid and gid **999** [V-src], matching the task definition |
| No server | The image contains the server binaries, but the task overrides the entry point with `sh -c <db-bootstrap.sh>`, so `postgres` never starts and no port is opened. No PostgreSQL server container is introduced |
| Architecture | Pinned digest is the **linux/amd64** manifest [V-reg] |
| Immutable digest | Manifest body hashes to the digest [V-reg] |

ECR Public tag `16.15-bookworm` index lists linux/amd64 `sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e` (manifest body hash verified), plus arm/v7, arm64/v8, 386, ppc64le and attestation entries; amd64 config digest `sha256:cadebe7c…f144f`. A cross-check of the same tag on Docker Hub was refused by Docker Hub's rate limit, so for PostgreSQL only the AWS mirror was read [V-reg].

**Binary-level inspection was not possible:** the registries' blob downloads redirect to CDN hosts
this session's network policy refuses, and Docker Hub rate-limited the session. The utility and
uid evidence is the image build source at the exact commit the tag is built from, not a listing of
the image's files. The first `db-admin` run (runbook step 10) is the practical proof; it fails
safely (non-zero exit, nothing changed) if a utility were missing.

---

## 6. Terraform inputs for Config A1

Template: `supporting/nonprod.config-a1.tfvars.TEMPLATE` (no secret; placeholders only where the
owner's values do not exist yet). Changes to `envs/nonprod.tfvars`:

| Input | A1 value | Source |
|---|---|---|
| `images` | `identity_api`, `identity_migrate` only (§5.1) | Verified |
| `valkey_image` | §5.2 | Verified |
| `postgres_image` | §5.3 | Verified |
| `identity_signing_kid` | `identity-nonprod-2026-11` | Decided (brief) |
| `identity_public_keys` | `[{"kid":"identity-nonprod-2026-11","publicKey":"<SPKI PEM>"}]` | Owner, guide A.2 (placeholder) |
| `db_bootstrap_products` | `["identity"]` | Decided |
| `desired_counts` | All 10 keys; `identity = 1`, every other key `0` | Decided: nothing but Identity can run even if an image were added by mistake; a partial map breaks `desired_counts["…"]` lookups |
| `secret_version_ids` | `{ identity = "<uuid>", identity-migrate = "<uuid>" }` | Owner, guide B.2 (placeholder). Pinning in the same PR keeps one apply; a later pin would be another task-definition revision |
| Unchanged | `environment`, `account_id`, `vpc_cidr`, `edge_enabled = false`, `services_enabled = false`, backstop schedule, `hosts` (incl. `docs`), `certificate_domains`, `operator_cidrs = []`, `docs_redis_image`, database and log settings | Already on main |
| Not set in A1 | `operator_access` (only Control needs it; without it the operator host answers 403), `control_*`, Work, School and Docs images, `identity_default_organisation` (empty: the sign-in form names the organisation, the safe default of a shared deployment) | — |

No variable forces a Control, Work, School or Docs digest: every image is `optional(string, "")`,
and `operator_access` is required only when a Control image is set [V-repo `variables.tf`].
`hosts` must keep all five required names (the type has no optional `control_api`, `work`,
`school`), which is why they stay; they create nothing without images.

---

## 7. Secret inventory (names and keys only)

From `stack/data.tf`, `stack/services.tf`, `stack/ops.tf`, Identity `packages/config/src/environment.ts`
and `apps/api/scripts/bootstrap-account.mjs` [V-repo]. ECS refuses to start a task whose secret lacks
a key it injects, so every key below must exist.

| Secret | Key | Format and rule | Made by | Read by (A1) |
|---|---|---|---|---|
| `munaxa-nonprod/identity` | `DATABASE_URL` | `postgresql://identity_app:<64 hex>@<endpoint>:5432/identity?sslmode=require` | Owner (generator) | `identity` service; `db-admin` (as `IDENTITY_APP_URL`) |
| | `IDENTITY_SIGNING_PRIVATE_KEY` | PKCS#8 PEM, P-256, real newlines inside the JSON string (`\n` escapes); 100+ characters; never a public key | Owner (generator) | `identity` service |
| | `IDENTITY_SIGNING_SECRET` | 64 hex (schema minimum 32); the refresh-token pepper | Owner (generator) | `identity` service |
| | `REDIS_URL` | `redis://:<REDIS_PASSWORD>@127.0.0.1:6379` | Owner (generator) | `identity` service |
| | `REDIS_PASSWORD` | 64 hex; same value as in `REDIS_URL` | Owner (generator) | `identity` service and its Valkey sidecar |
| `munaxa-nonprod/identity-migrate` | `DATABASE_MIGRATION_URL` | `postgresql://identity_owner:<64 hex>@<endpoint>:5432/identity?sslmode=require` | Owner (generator) | `identity-migrate`; `identity-bootstrap` (as `DIRECT_DATABASE_URL`); `db-admin` (as `IDENTITY_OWNER_URL`) |
| `munaxa-nonprod/identity-bootstrap` (**temporary**, not a Terraform resource) | `IDENTITY_OWNER_EMAIL` | Dedicated Testing address the owner controls | Owner | `identity-bootstrap` only |
| | `IDENTITY_OWNER_PASSWORD` | 32 random characters from a password manager, unique (policy 12 to 128) | Owner | `identity-bootstrap` only |
| RDS-managed master secret (`rds!db-…`) | `username`, `password` | Managed by RDS | AWS | `db-admin` only |

Rules checked by code: role and database names must be `identity_app`, `identity_owner`, `identity`;
passwords `[A-Za-z0-9]{32,128}`; both URLs the same database; host the endpoint DNS name (node-postgres
verifies it) [V-repo `db-bootstrap.sh`, Identity runbook]. Encryption: all three secrets with
`alias/munaxa-nonprod-data` (the execution roles decrypt only through that key). The bootstrap secret
is created after `identity-migrate` and deleted with `--force-delete-without-recovery` right after
bootstrap steps 1 to 3 (guide C and D). No A1 task reads a Control, Work, School or Docs bundle;
`db-admin`'s G3 policy can read the other products' URL bundles, but with
`db_bootstrap_products = ["identity"]` its task definition injects only the two Identity URLs.

---

## 8. Identity signing key

### 8.1 The existing script

`munaxa-identity/apps/api/scripts/generate-signing-key.mjs` at `5277d71` [V-repo]: arguments
`[--kid <id>]` only; generates `generateKeyPairSync('ec', { namedCurve: 'P-256' })`; writes to
**stdout** a block with `IDENTITY_SIGNING_ALGORITHM=ES256`, `IDENTITY_SIGNING_KID`,
`IDENTITY_SIGNING_PRIVATE_KEY="<PKCS#8 PEM>"` and `PLATFORM_AUTH_PUBLIC_KEYS=[{kid, publicKey}]`.
Its format is right; **its output channel is not**: run in PowerShell it displays the private key,
which the brief forbids. It writes no file, so there is no flag to redirect it safely.

### 8.2 Replacement

`supporting/identity-a1-owner-values.mjs`: the same key generation and formats, plus the four random
values and both bundle JSONs. Secret output only on stdout, which it refuses to write to a terminal;
public output on stderr and in two public files. Owner steps: guide A.

### 8.3 Local verification [V-local, Node 22.23, fake endpoint]

13 checks pass (PKCS#8 and SPKI markers; curve `prime256v1`; derived public key equals the exported
one; ES256 signature verifies; four distinct 256-bit values; role and database names; password
pattern; key lengths; key sets equal `data.tf`). The bundle JSON parses back to a PEM with real
newlines that `createPublicKey` accepts (what Identity's `loadSigningKey` does). The URLs parsed
with `db-bootstrap.sh`'s own `sed` expressions give `identity_app`/`identity_owner`, database
`identity`, valid passwords. Refuses a terminal stdout and a non-endpoint host. No secret was printed
in these checks; the test outputs were deleted.

---

## 9. IAM and provider uncertainties for A1

No simulation was run (not authorized). From code [V-repo] and the 8 Nov assessment [V-prior]:

| # | Action in the A1 apply | Deployer allow | Status |
|---|---|---|---|
| I-1 | `ecs:RegisterTaskDefinition` (4 families) with tags | `OwnNames` on `task-definition/munaxa-nonprod-*`; AWS documents the task-definition ARN as its resource | **NOT VERIFIED** (never exercised) |
| I-2 | `iam:PassRole` of the 4 new execution roles to `ecs-tasks` at registration | `PassOwnRoles` on `role/munaxa-shared/munaxa-nonprod-*`, `iam:PassedToService` | **NOT VERIFIED** |
| I-3 | `iam:CreateRole` with boundary, `PutRolePolicy` (4 roles) | Exercised in G3 (db-admin roles) | Likely; same statements |
| I-4 | `logs:CreateLogGroup`, retention, tags (2) | Exercised in G3 (ops log group) | Likely |
| I-5 | `ec2:CreateSecurityGroup` and rules in the VPC | Exercised in G3 recovery after #55 | Likely |
| I-6 | `kms:*` on the licence key | **Not in A1** (no Control) | Not applicable; F-4/D-5 stay with A2 |

New runtime privileges created by A1: the Identity execution role reads only `munaxa-nonprod/identity`
and pulls only `munaxa-identity/api`; the migrate role only its bundle and image; the bootstrap role
the migrate bundle and `munaxa-nonprod/identity-bootstrap-??????`. No task role (Identity needs no
AWS API at runtime). No policy is broadened by this PR; no access-policy change. **The first apply
stops on any `AccessDenied`** (decode, read the policy in code, report; ACCESS-POLICY D-8).

---

## 10. Identity deployment readiness checklist

| # | Item | Status (9 Nov) |
|---|---|---|
| 1 | Image digests verified | **Done** (GitHub logs today; ECR 8 Nov). ECR re-read in runbook step 3 |
| 2 | Signing key generated, public key validated | **Open, owner** (guide A; validation built in) |
| 3 | Secret bundles populated by the owner | **Open, owner** (guide A.3, A.4) |
| 4 | Valkey and PostgreSQL digests selected | **Done** (§5.2, §5.3) |
| 5 | Terraform inputs validated | **Done for the template** (mocked plan); real values after item 2 |
| 6 | Docs task definition excluded | **Done** (this PR, test) |
| 7 | Actual Config A1 plan generated | Open (after B-1 to B-4) |
| 8 | Actual plan reviewed against the declaration | Open |
| 9 | Owner approval obtained separately | Open |
| 10 | Config A1 apply after explicit authorization | Open |
| 11 | Identity task definitions and services prepared | Open (apply, then session `up`) |
| 12 | Identity database migration completed | Open (runbook 10, 11) |
| 13 | Identity bootstrap completed | Open (runbook 12 to 15) |
| 14 | Temporary bootstrap secret deleted | Open (runbook 16) |
| 15 | Identity login and health checks passed | Open (runbook 18, 19) |
| 16 | Operator access verified | Open (runbook 20: operator host refuses with 403 in A1) |
| 17 | ACM attachment and certificate behaviour checked | Open (runbook 21) |
| 18 | Session shut down | Open (runbook 22) |
| 19 | RDS stopped | Open (runbook 22, 23) |
| 20 | Cost and shutdown evidence recorded | Open (runbook 23) |

Nothing in items 7 to 20 was executed in this task.

---

## 11. Architecture and cost (unchanged)

eu-central-1; the existing nonprod VPC, public subnets with public IPs and restrictive security
groups, no NAT; RDS stopped outside sessions; services only during on-demand sessions; the 21:00
UTC backstop remains a safety net, not the shutdown method. A1 adds no always-on resource and no
monitoring; its resources cost nothing while idle. A session costs about US$0.10 an hour
(runbook). The idle total stays about US$13 to 15 a month [V-prior #67 §10], within the US$50 target.

---

## 12. Remaining risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | Fresh AWS state not re-read (connector sign-in) | Runbook step 3 before the inputs PR |
| R-2 | Deployer permissions I-1, I-2 never exercised | Stop on `AccessDenied` at apply; nothing is broadened pre-emptively |
| R-3 | Real plan may show provider-normalized updates the mock cannot | Stop condition §4.3; explain before any declaration change |
| R-4 | PostgreSQL and Valkey contents checked from build source, not file listings | First `db-admin` and session runs fail safely if wrong |
| R-5 | Scheduled `aws-session` runs fail between the inputs merge and the apply | Safe failure; backstop covers; steps 4 to 7 in one sitting |
| R-6 | `identity-bootstrap` names its secret by partial ARN (no suffix) | Identity runbook: confirm the task starts; on `ResourceInitializationError`, stop and switch to the full ARN by PR |
| R-7 | Secret values visible in the console editor while pasting; clipboard exposure | Clipboard history off, clear the clipboard, close the editor (guide A) |
| R-8 | `IDENTITY_AUTH_AUDIENCE` carries both audiences; no MFA claim | Known Identity open points; only Identity runs in A1 |
| R-9 | Tags `node:22-alpine` in Identity's Dockerfile (rebuilds not byte-identical) | The deployed images are pinned by digest |
| R-10 | Old Docs final snapshot still costs about US$2 a month until about 4 Dec | Unchanged, separate decision |

---

## 13. Authorization boundary

| Area | In this task |
|---|---|
| Terraform | **No apply, no destroy, no plan against AWS.** Local `fmt`, `validate`, `test` with a mocked provider only |
| AWS | **No call succeeded** (connector sign-in expired); no write, no `Simulate*`, no secret read |
| Secrets, KMS | **None** created, updated, retrieved or printed. No KMS key created or modified |
| GitHub | Read only (PR, commits, job logs). One branch and one PR in munaxa-platform, **not merged**. No setting, secret, variable, environment, ruleset, tag or workflow dispatch |
| Images | None published |
| DNS, Cloudflare | None |
| Database | No migration, no bootstrap |
| Production, Render, Supabase | None |
| CanteenHub | Not inspected or touched |

Public registry reads (ECR Public, Docker Hub manifests) and GitHub source reads were the only
external reads besides GitHub.
