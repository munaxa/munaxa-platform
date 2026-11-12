# Docs migration security hardening (L-1, L-2, L-5, L-6), 12 Nov 2026

**Status: ALL FOUR FINDINGS FIXED IN REPOSITORY CODE.** Nothing was deployed.

| Repository | PR | Reviewed final head | Squash merge on `main` |
| --- | --- | --- | --- |
| munaxa-docs | [#177](https://github.com/munaxa/munaxa-docs/pull/177) | `c4beeee` | `9d06698` (`9d06698186fd1907206997a0586aaff713072b26`) |
| munaxa-platform | [#105](https://github.com/munaxa/munaxa-platform/pull/105) | `21b4320` (code), then this report | The squash commit of #105 (this report ships in the same PR) |

- **Requested by:** Tamer, 12 Nov 2026 05:50 UTC. The scope was repository work only.
- **Baselines:** munaxa-docs main `0515667` (DC-01), munaxa-platform main `7cc0f30`.
- **Input:** the Low findings L-1, L-2, L-5 and L-6 of `2026-11-11-docs-migration-path/00-DOCS-MIGRATION-PATH.md`.
- **Independent review:** a separate reviewer agent, two rounds. Its final verdict was **APPROVE for both PRs on the exact final heads**. All round-1 Medium findings were fixed. One Low remains, and it is deferred with a reason (section 8).
- **CI:** every check was green on both final heads before each merge (section 7).

No AWS API was called. No Terraform plan or apply ran against a real backend, no secret was created, read or changed, no image was published, and no real database was touched (section 11).

---

## 1. Executive summary

| Finding | Before | After |
| --- | --- | --- |
| **L-1** Migration concurrency | No lock. Two runs on one tenant database could interleave their SQL steps. The runbook said only "never start a second copy". | A PostgreSQL session advisory lock per tenant database, taken before the first statement and held to the last. Second run: bounded wait (default 120 s, 0 to 3600), then **exit 3** with the database untouched. Released on success, failure, cancellation and connection loss. Every SQL step re-checks the lock inside its own transaction. |
| **L-2** Application write on `_prisma_migrations` | A default privilege gave `edms_app` write on every table `edms_owner` created. That included Prisma's history from `migrate deploy` until the post-migration SQL revoked it, a window that a failed run left open. | Default table privilege withdrawn before every migration. The history is revoked in `01-grants.sql`, and again in the same transaction as each post-migration file (the file grants and the REVOKE commit together or not at all). An assertion fails the step if `edms_app` keeps any write by any route. |
| **L-5** Migration secret lifecycle | The `docs-migrate` bundle existed only while every Docs image was pinned, so clearing an image scheduled the owner credential for deletion. The owner password was kept twice: `docs-operator.EDMS_OWNER_PASSWORD` and inside `docs-migrate.DATABASE_MIGRATION_URL`. | The bundle follows `hosts.docs`. The password is kept once, in the URL. `docs-db-admin` derives it in psql and refuses anything that is not `edms_owner` on the tenant database before any role statement. The URL reaches the server only as a bound parameter. |
| **L-6** Buffered migration output | `spawnSync` buffered every child's output until exit: nothing visible during a long migration, unbounded memory, all-or-nothing redaction. | Streamed line by line through a redacting writer. Memory is bounded at 64 KiB plus the longest secret. Redaction holds across chunk splits. Exit codes are preserved. Children run in their own process group and are stopped on cancellation. |

The order docs-db-admin → docs-migrate → docs-provision → API rollout, the schema-readiness gate, forced RLS, and the image/task separation are unchanged. No historical Prisma migration or post-migrate SQL file was changed. No new dependency was added.

## 2. Current-state verification

Each finding was re-checked on the baseline mains before any change.

| Finding | Source checked | Still present? |
| --- | --- | --- |
| L-1 | `scripts/migrate-tenants.mjs`, `apply-post-migrate.mjs`: no `pg_advisory_lock`; `docs/operations/deployment.md` §2 "never start a second copy" | Yes |
| L-2 | `infra/sql/database/01-grants.sql`: `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edms_app`; the REVOKE ran only in the post-migrate closing record | Yes. Reproduced locally: with the old default in place, `edms_app` had INSERT on `_prisma_migrations` right after `migrate deploy` (now kept as the integration test "a database migrated by an earlier release loses the old default and the old write"). |
| L-5 | platform `stack/data.tf`: `docs-migrate` in the `docs_defined` (images pinned) map; `docs.tf`: `docs_operator_keys` included `EDMS_OWNER_PASSWORD` | Yes |
| L-6 | `scripts/migration-support.mjs`: `spawnSync(..., {encoding})`, output redacted after exit | Yes |

## 3. Root cause and implementation

### L-1 Migration lock (munaxa-docs)

- **Root cause:** the runner had no mutual exclusion. Prisma's own advisory lock covers only `migrate deploy`, not the per-database SQL or the post-migration SQL around it.
- **Lock identity:** two-key advisory lock `(1297436248, 1145915719)` ('MUNX', 'DMIG'), `pg_locks.objsubid = 2`. That is a different key space from Prisma's bigint lock, so the two never contend.
- **Session:** a dedicated Prisma Client connection (`connection_limit=1`, `application_name=munaxa-docs-migrate-lock`). The backend PID is checked on every query, so a replaced connection counts as a lost lock.
- **Wait:** polled every 500 ms for `MIGRATION_LOCK_TIMEOUT_SECONDS` (default 120, 0 to 3600; any other value is exit 2). On timeout: exit 3 naming the holder's backend, with nothing read or changed.
- **Fail closed:** an unreachable database or refused credentials give exit 1 at "acquiring the migration lock", before any step.
- **Per-step guard:** every SQL step (per-database SQL, opening and closing of the post-migration record, each post-migration file) starts with `assertLockHeldSql(pid)` in the same transaction. A step started after the lock was lost commits nothing.
- **Heartbeat:** every 5 s. A check that does not answer within 10 s also counts as lost. On loss, a running SQL step is stopped. A running `migrate deploy` is left to finish (killing it would leave a failed migration needing `migrate resolve`), and the run fails right after it.
- **Release:** in `finally` after the last step. SIGTERM/SIGINT stop the running step's process group, wait for it, release the lock and exit 1. PostgreSQL also releases a session lock whenever the session ends.
- **Nested runs:** `apply-post-migrate.mjs` run on its own takes the same lock. Run by the runner, it inherits the runner's lock session through the internal `MIGRATION_LOCK_BACKEND_PID`.
- **Prisma Client in a fresh checkout:** the lock needs a generated Prisma Client. The migration image always has one. A checkout without one now runs `prisma generate` once from the schema before the lock, connecting to no database. The first CI run on #177 found this gap.

### L-2 No application write on the history (munaxa-docs)

- **Root cause:** a table-level default privilege for `edms_owner` handed `edms_app` write on every new table, Prisma's history included, until post-migrate SQL took it back.
- `01-grants.sql` now withdraws that default (`REVOKE ... ON TABLES FROM edms_app`, sequences keep `USAGE, SELECT`). It also revokes write on an existing `_prisma_migrations` (databases migrated by earlier releases) before any migration.
- `apply-post-migrate.mjs` runs each post-migration file together with `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public._prisma_migrations FROM edms_app` in one `prisma db execute --stdin` transaction (verified: an error rolls the whole script back). No other session ever sees the grant that `01-tenant-isolation.sql` makes.
- After every REVOKE, a `has_table_privilege` assertion raises if `edms_app` can still write the history by any route (a non-owner REVOKE only warns; PUBLIC; role membership).
- `verify.sh` gained M-12 (no write right after `migrate deploy`, no default table ACL).

### L-5 Migration secret lifecycle and one owner credential (munaxa-platform)

- **Root cause:** the bundle was keyed on "every Docs image pinned" rather than on "Docs enabled". The owner password had two homes that could drift.
- `stack/data.tf`: `docs-migrate` moved to the `docs_enabled` (`hosts.docs`) map. The bundle exists before any image is pinned, survives clearing an image, and goes when the host goes. The `for_each` key is unchanged, so nothing is replaced.
- `stack/docs.tf`: `docs-operator` holds only `EDMS_APP_PASSWORD` and `EDMS_BACKUP_PASSWORD`. `docs-db-admin` reads `DATABASE_MIGRATION_URL` from `docs-migrate` at the same pinned version as `docs-migrate`, and its execution role may read that one extra secret. `docs-api` and `docs-provision` are unchanged and never read it.
- `stack/scripts/docs-owner-password.sql`, included first in the db-admin SQL:
  - Reads the URL with `\getenv` and sends it to the server only as a bound parameter (`\bind`), so a failing or logged-on-error statement shows `$1`.
  - Requires: user `edms_owner`, database = `TENANT_DATABASE`, one host (no raw `@` in the password), no `user`/`password`/`dbname` query override, a non-empty password with well-formed escapes, decoding to valid UTF-8 without NUL. Validity is checked on the hex bytes, so the check itself cannot raise an error carrying a password byte.
  - Otherwise it raises "must be edms_owner, with a password, on the tenant database; no role was changed" before any role statement.
  - Decodes exactly as libpq and Prisma decode, into the psql variable `owner_pw`.
- `CONTRACT.md`: rotation is one write of the URL, one pin, one `docs-db-admin` run, one `docs-migrate` run.

### L-6 Streamed output (munaxa-docs)

- **Root cause:** `spawnSync` with output captured as strings.
- `runStreaming()` spawns asynchronously (`detached`, own process group) and pipes stdout and stderr through `createRedactingWriter()`:
  - Complete lines are written as they arrive.
  - Every secret occurrence is replaced before any cut. A cut inside a line leaves a full secret length held.
  - URLs are matched only in text being written, and cuts are made only at whitespace.
  - A whitespace-free run longer than 64 KiB is withheld (with a one-line note) up to the next whitespace character that no secret contains.
- Secrets redacted: the URL password as parsed, as decoded, as written in the URL, and JSON-escaped forms; every PostgreSQL URL by pattern.
- **Exit statuses:** non-zero kept as is; signal or spawn error becomes 1. Runner exit codes: 0 OK, 1 failed/cancelled/lock lost, 2 configuration, 3 locked.
- `stopRunningChildren()` sends SIGTERM to each child's process group, then SIGKILL after 10 s. This catches Prisma's schema-engine grandchild.

## 4. Security impact

| | Before | After |
| --- | --- | --- |
| Concurrent runs | Interleaved DDL/SQL possible; post-migrate records could be claimed by the wrong run | Mutually exclusive per database; a second run exits 3 untouched |
| History integrity (the schema gate trusts it) | `edms_app` could write `_prisma_migrations` in a window, or permanently after a failed run | Never, on fresh and upgraded databases, asserted after every REVOKE |
| Owner credential | Two copies, rotation could drift; bundle deleted when an image was cleared | One copy, one rotation; bundle tied to `hosts.docs`; URL never in statement text |
| Migration logs | Nothing until exit; whole output in memory; redaction after the fact | Live, bounded, redacted at every chunk boundary |

## 5. Files changed

**munaxa-docs** (#177):
- `scripts/migration-support.mjs`
- `scripts/migrate-tenants.mjs`
- `scripts/apply-post-migrate.mjs`
- `infra/sql/database/01-grants.sql`
- `scripts/migration-image/verify.sh`
- `.github/workflows/ci.yml` (new "Migration runner integration tests" step)
- `docs/operations/deployment.md`
- `infra/sql/README.md`
- `scripts/__tests__/migration-output.test.mjs` (new)
- `scripts/__tests__/migration-support.test.mjs`
- `scripts/__tests__/integration/{database,run}.mjs` (new)
- `scripts/__tests__/integration/migration-lock.test.mjs` (new)
- `scripts/__tests__/integration/migration-privileges.test.mjs` (new)

**munaxa-platform** (#105):
- `infra/aws/stack/data.tf`
- `infra/aws/stack/docs.tf`
- `infra/aws/stack/scripts/docs-owner-password.sql` (new)
- `infra/aws/stack/scripts/docs-owner-password.test.mjs` (new)
- `infra/aws/stack/tests/stack.tftest.hcl`
- `infra/aws/stack/tests/docs-secret-lifecycle.tftest.hcl` (new)
- `.github/workflows/aws-terraform.yml` (psql test requires PostgreSQL in CI)
- `infra/aws/CONTRACT.md`
- `infra/aws/README.md`
- this report and the index line

## 6. Tests and results

Local results on the final heads, against a throwaway local PostgreSQL 16 cluster; the same suites run in CI (section 7).

**munaxa-docs unit (`node --test scripts/__tests__/*.test.mjs`): 23/23 pass.** L-6 and helpers (`migration-output.test.mjs`):
- output reaches the log while the child is still running
- a partial line is held until its end arrives, and an unterminated last line is flushed
- a secret split between two chunks, at every possible position, is still redacted
- a secret pushed one character at a time is redacted
- an over-long line is written in bounded pieces without cutting through a secret or a URL
- a huge run without whitespace is withheld, not cut, so no URL can be written in halves
- a secret containing whitespace that straddles the end of a withheld run is not written
- the password as written in the URL, decoded, re-encoded or JSON-escaped is redacted
- large output streams through with bounded pieces and nothing lost (about 10 MB)
- a non-zero exit status is returned as it is; a signal or a missing program is 1
- no secret from the child environment reaches stdout or stderr, whatever the timing
- stopping a run stops the child and everything it started, then resolves
- the lock wait accepts 0 to 3600 whole seconds and defaults to 120
- the lock's connection is one named connection and keeps the URL's own parameters
- the exit codes are the documented ones

Plus 8 runner tests in `migration-support.test.mjs`, including "exits 1 and names the tenant and step when the database cannot be reached, printing no URL" (now at "acquiring the migration lock", before any step) and "exits 2, touching nothing, for a lock wait that is not 0 to 3600 whole seconds".

**munaxa-docs integration (`node --test --test-concurrency=1 scripts/__tests__/integration/*.test.mjs`): 15/15 pass.**

L-1 (`migration-lock.test.mjs`):
- is taken on its own named session and released by release()
- a second taker times out after the bounded wait, naming the holder
- a waiting taker gets the lock as soon as it is released
- a second runner is refused (exit 3) and changes nothing while another run holds the lock
- is released after a successful run
- is released after a failed run
- two runners at once: the second waits for the first, and both finish cleanly
- cancellation stops the running step, then releases the lock
- a run that loses its lock session stops with exit 1
- every SQL step checks, in its own transaction, that its run still holds the lock

L-2 (`migration-privileges.test.mjs`):
- a fresh database: no write between `migrate deploy` and the post-migration SQL
- the application role is refused every write to the history, and keeps its run-time access (forced RLS checked)
- no other session ever sees the grant the post-migration SQL makes and takes back
- a database migrated by an earlier release loses the old default and the old write
- a write the REVOKE cannot take away (through PUBLIC) fails the run instead of passing

**Existing behaviour (unchanged, re-run):** API Prisma gate unit tests 35/35; `schema-readiness.integration` + `security.integration` 31/31.

**Migration image (`verify.sh`, CI job "Migration image · disposable databases"):** M-1 to M-10 as before, M-8 now requires two concurrent runs to both exit 0 with no overlap, new M-11 (holder → exit 3 untouched → exit 0 after release), new M-12 (no history write after `migrate deploy`).

**munaxa-platform `terraform test`: 45/45 pass** (stack 41, lifecycle 4). L-5 runs:
- `docs_host_only_creates_every_docs_bundle_and_no_task`
- `pinning_the_docs_images_registers_the_tasks_against_the_same_bundle`
- `clearing_a_docs_image_keeps_the_owner_credential`
- `removing_the_docs_host_leaves_no_docs_secret_behind`
- `docs_db_admin_takes_the_owner_password_only_from_the_migration_url` (secret map, no owner key anywhere, check before any ALTER ROLE, IAM Resource list exact, API and provision separation)
- `docs_without_its_migration_image_is_not_defined` (bundle now exists), the Config A1 run (11 bundles), `without_a_docs_host` (no `docs*` bundle)

Mutation checks: tying the bundle back to `docs_defined`, restoring the owner key in `docs-operator`, and moving the owner check after the cluster roles each fail the suite.

**munaxa-platform `docs-owner-password.test.mjs`: 22/22 pass** (4 decoding cases × 2 URL forms; 16 refusals incl. raw `@`, `%FF`, `%C3`, `%00`, overlong `%C0%AF`, query overrides; a server-log assertion; the unset-variable case). CI requires PostgreSQL for it (`DOCS_OWNER_PASSWORD_TEST_REQUIRE_POSTGRES=1`).

## 7. CI and final SHAs

**munaxa-docs #177, final head `c4beeee9da255268950354d1f400f86671acf01e`.** Two CI runs fired for the head ([43170067289](https://github.com/munaxa/munaxa-docs/actions/runs/43170067289), [43170073050](https://github.com/munaxa/munaxa-docs/actions/runs/43170073050)), both all green before the merge:

| Job | Result |
| --- | --- |
| Lint · Typecheck · Test · Build (includes the migration runner unit tests) | success |
| Integration · real PostgreSQL, two tenants (includes "Migration runner integration tests") | success |
| Migration image · disposable databases (`verify.sh`, M-8, M-11, M-12) | success |
| Release smoke · images from this commit | success |
| Container images · three targets from one commit | success |
| End-to-end, five shards | success |
| Product isolation, Production Terraform workflow | success |

In run 43170073050 the Lint job first failed in `apps/web` visual tests ("Page.captureScreenshot: Unable to capture screenshot", a headless-browser error in code this PR does not touch). The same job on the same SHA passed in run 43170067289. One re-run of the failed job passed ([job 131025883644](https://github.com/munaxa/munaxa-docs/actions/runs/43170073050/job/131025883644)).

The first CI run on #177 (head `d1d80a7`) failed Integration and E2E with "Cannot find module '.prisma/client/default'". That was a real gap: CI migrates before `prisma generate`. It was fixed in `c1006bb` (section 3, L-1).

**munaxa-platform #105, reviewed code head `21b43207786e70de3504ef3b96edda87c4f6a8ee`.** "Format, validate, mocked plan tests" (terraform fmt/validate/test and the psql test with PostgreSQL required), "Lint · Typecheck · Test · Build", "Façades match the platform surface" and "Accessibility" all succeeded ([run 43169620367](https://github.com/munaxa/munaxa-platform/actions/runs/43169620367), [run 43169620468](https://github.com/munaxa/munaxa-platform/actions/runs/43169620468)). Plan and Apply are `workflow_dispatch`-only and were skipped. The final platform head adds only this report and its index line.

## 8. Independent review

A separate reviewer agent reviewed the exact heads, read-only, with its own probes on throwaway clusters.

**Round 1** (docs `c1006bb`, platform `9ecaf41`): platform CHANGES REQUIRED, docs APPROVE.

| ID | Sev. | Finding | Resolution |
| --- | --- | --- | --- |
| P1 | Medium | Owner password in the server log when `convert_from` errors (invalid UTF-8 in the URL) | Fixed: URL only as `\bind` parameter; UTF-8 validated on hex without raising; log-file test |
| P2 | Medium | Nonprod plan changes (+1 create, 1 update) not in `nonprod.expected-changes.json` | Documented in `CONTRACT.md` as a pending plan delta. That file is the already-applied Config A1 declaration; each apply's declaration is written in its own owner-approved PR. Reviewer: sufficient. |
| P3 | Low | Raw `@` in the password truncated it; query overrides accepted | Fixed |
| P4 | Low | Two idempotent `ALTER ROLE` ran before the URL check | Fixed: check runs first, tested |
| D1 | Medium | Heartbeat could kill `migrate deploy` mid-migration | Fixed: deploy finishes, run fails after |
| D2 | Low | Stale heartbeat could call `onLost` after `release()` | Fixed |
| D3 | Low | Heartbeat had no timeout (half-open connection) | Fixed: 10 s |
| D4 | Low | Doc overstated the per-step guarantee | Fixed wording |
| D5 | Low | REVOKE by a non-owner fails silently | Fixed: assertion after every REVOKE, tested |
| D6 | Low | Redaction gaps (whitespace secret at a withheld boundary; raw and JSON forms) | Fixed, tested |
| D7 | Low | `MIGRATION_LOCK_BACKEND_PID` set by hand skips locking | Documented as internal |

**Round 2** (docs `c4beeee`, platform `21b4320`): **APPROVE both.** Every round-1 finding verified fixed or acceptably documented. One new Low:

- **Duration logging records bound parameters.** The shared RDS parameter group sets `log_min_duration_statement = 1000`. A statement slower than 1 s logs its parameters, so the URL could appear. This also applied before this PR to any slow `ALTER ROLE ... PASSWORD`. **Deferred:** the fix (`log_parameter_max_length = 0`, `log_parameter_max_length_on_error = 0`) changes the database parameter group shared with Identity. It belongs in its own owner-approved change, declared in the apply that carries it, not in a Docs PR (section 10).

## 9. PRs and merge status

| PR | Status |
| --- | --- |
| [munaxa/munaxa-docs#177](https://github.com/munaxa/munaxa-docs/pull/177) | Squash-merged as `9d06698` on 12 Nov 2026, after CI was green and review approved the exact head `c4beeee`. |
| [munaxa/munaxa-platform#105](https://github.com/munaxa/munaxa-platform/pull/105) | Squash-merged with this report, after CI on the final head (review approved code head `21b4320`; the report commit adds documentation only). |

Merges followed the standing instruction of 30 Oct (green required checks, no Critical/High findings, nothing deploys or migrates on merge). Merging #105 changes no infrastructure: the plan delta in section 10 applies only when an owner-approved nonprod apply runs.

## 10. Remaining risks and deferred items

1. **Pending nonprod plan delta (must be declared).** With `hosts.docs` set and no Docs images (nonprod today), the next nonprod plan shows `+1` `aws_secretsmanager_secret.service["docs-migrate"]` and `~1` `aws_iam_role_policy.docs_db_admin_execution[0]`. Whoever writes the next `envs/nonprod.expected-changes.json` (for example Identity Stage C/D) must list both, or `check-plan-intent.sh` refuses. Prod: no change.
2. **RDS parameter logging (review Low, deferred).** Set `log_parameter_max_length = 0` and `log_parameter_max_length_on_error = 0` on `aws_db_parameter_group.main` in a separate, owner-approved infrastructure change.
3. **Images built before this release take no lock.** Do not run an older migration image against a database alongside a new one.
4. **Lock-loss window.** A step already running when the lock session dies is not undone, and `migrate deploy` is protected by Prisma's own lock rather than the per-step check. The heartbeat detects loss within about 5 to 10 s and fails the run.
5. **First production run.** The new history assertion stops a migration on any database whose `_prisma_migrations` is not owned by `edms_owner`. That is intended; fix ownership before re-running.
6. **Owner password format.** It must decode to UTF-8 without NUL and carry no raw `@`. Hex passwords, as the runbook prescribes, always qualify.
7. **Docker `verify.sh` not run locally.** It ran in CI (Migration image job) on the final heads.
8. **Not in scope and untouched:** L-3, L-4 and L-7 of the DC-01 report.

## 11. Confirmation of what was not touched

- No AWS API call of any kind; no AWS MCP tool was used. No account, ECR, ECS, RDS, IAM, KMS, Secrets Manager, security group, network, S3 or CloudWatch resource was created, read, changed or deleted.
- No `terraform plan` against a real backend and no `terraform apply`. All Terraform runs were `terraform test` with mocked providers and `-backend=false`.
- No secret created, read, rotated, updated or deleted; no secret value displayed. Test passwords were throwaway values on local clusters.
- No container image built for or pushed to ECR or any registry (CI builds images locally in the runner only, as before).
- No migration run against, and no connection to, any deployed database. Only local throwaway PostgreSQL clusters and CI service containers.
- No deployment, no Docs enablement, no DNS/Cloudflare/certificate/endpoint change, no workflow dispatch, no workflow permission change, no GitHub App change, no production data accessed.
