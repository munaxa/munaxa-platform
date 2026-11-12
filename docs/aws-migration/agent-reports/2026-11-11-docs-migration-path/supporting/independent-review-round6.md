## Independent review: DC-01 (munaxa-docs#176, munaxa-platform#104)

I found no Critical, High or Medium issues in either PR, so both are APPROVE. There are seven Low findings, listed below; none blocks the merge.

**Heads checked.** `git rev-parse HEAD` matches both: munaxa-docs is at 2593f610997883a5f104ff340a3b45ba657b8a98 and munaxa-platform is at 5c4bad6fe932feacbff80d42ec24bfc512e8b814. I diffed against `origin/main` after fetching it.

**Offline checks I ran.**
- `node --test scripts/__tests__/*.test.mjs`: 7 of 7 pass.
- `cd apps/api && npx vitest run src/core/prisma`: 3 files, 35 tests pass.
- Platform `terraform init -backend=false && terraform test`: 40 passed, 0 failed.

I did not run `verify.sh`, which needs Docker and a database. the author's local output (now `supporting/verify-sh-local-2593f61.txt`) reports every M, P, A and C check as OK; I read the script and its checks match what it claims, but the output itself is still only the author's claim. I called no AWS API, did no apply or push, posted no comment and touched no database.

### Findings

| # | Sev | Location | Finding and failure scenario |
|---|---|---|---|
| L-1 | Low | docs `apps/api/src/core/prisma/schema-readiness.ts:114-119` (OPEN_RUN_SQL) and `scripts/apply-post-migrate.mjs:70-125` | **An overlapping older run can leave its files in effect unseen.** The "open run" check only counts unfinished runs with an id above the newest closed run. Scenario: release N's runner A opens (id 1); release N+1's runner B opens (id 2) and completes; A then applies its own `03-*.sql` and fails or is killed before it closes. A is never seen as open, the newest closed run is B, and the N+1 API and provisioning pass while N's version of 03 is in effect. This needs two migrations from different releases running at once, which `migrate-tenants.mjs:31-34` and deployment.md §2 forbid ("Never start a second copy"). Suggested fix: a lock row or an advisory-lock guard in the opening record, or refuse when any run is still open from before the newest close. |
| L-2 | Low | docs `infra/sql/database/01-grants.sql:31-32` with `apply-post-migrate.mjs:91,123` | **`edms_app` can write the migration history for a short window on a fresh database.** The new revoke is correct and nothing in the repo needs `edms_app` to write `_prisma_migrations` (I grepped tests, CI, the e2e fixture, the DR rehearsal and compose; the only writes are verify.sh and the integration spec, which use the owner role or expect "permission denied"). But on a fresh database, Prisma creates `_prisma_migrations` as `edms_owner`, so the default privileges give `edms_app` INSERT/UPDATE/DELETE until the first post-migrate opening record. Exploiting that needs a compromised application role already, and an open run still refuses. On upgrades the revoke persists (01-grants does not re-grant existing tables), and after a run that fails in 02-04 the open run makes the gate refuse anyway. |
| L-3 | Low | docs `schema-readiness.ts:243-257`; deployment.md §2a "Rollback limits" | **Some rollbacks are accepted with the newer post-migration files in effect.** When the database is ahead of the build, the build's file versions are accepted from *any* completed run that covered its migrations, not only from the run whose files are in effect now. So rolling back past a release that added a migration *and* changed a post-migration file passes with the newer file active. This is deliberate and documented (expand-only rule); it is only a partial reading of "the build's file versions in effect". |
| L-4 | Low | platform `infra/aws/stack/outputs.tf:53-54` | **Nonprod and prod plans show an output-only change.** `run_task_network` gains two new keys whose value is null. That shows as "Changes to Outputs" in both plans. There are no resource changes: nonprod has no Docs images, so `docs_defined` stays false, and prod has no `hosts.docs`. `check-plan-intent.sh` compares only `resource_changes`, so it will not flag this. |
| L-5 | Low | platform `infra/aws/stack/data.tf:162-167` | **The `docs-migrate` secret follows the Docs images, not `hosts.docs`.** It exists only while every Docs image is set. Clearing an image schedules the secret (an owner credential) for deletion with a 30-day recovery window, and setting the image again within that window fails to create it. The bundle also duplicates `EDMS_OWNER_PASSWORD` from `docs-operator`, so rotating one means updating the other by hand. |
| L-6 | Low | docs `scripts/migration-support.mjs:93-127` | **Migration logs appear only when each command finishes.** Prisma output is buffered by `spawnSync` until the child exits, so a long or hung `migrate deploy` writes nothing to `/munaxa/<env>/docs-migrate` while it runs. Exit-code handling is correct: a child killed by a signal or a spawn error returns 1. |
| L-7 | Low | docs `Dockerfile:246-249` | **The migrate image is not fully reproducible.** The OpenSSL 3 schema engine is fetched at build time from Prisma's CDN, checked against a SHA-256 from the same CDN and not pinned by the lockfile. The base images are by tag (`node:22-bookworm-slim`) with `apt-get upgrade`, which was already the case. This is documented; deployment pins the result by digest. |

### What I specifically checked, with no issue found
- **Run record SQL.**
  - The SQL is built from validated file names, hex hashes and a UUID, so there is no injection.
  - Each `db execute` is one implicit transaction, and the post-migrate files use plpgsql blocks, not transaction control.
  - The gate's queries are all schema-qualified, so a temporary table cannot shadow them.
  - `edms_app` has only USAGE on `munaxa_meta` and SELECT on `post_migrate_run`; the default privileges cover `public` only.
- **CREATE SCHEMA permissions.** `edms_owner` owns the database on RDS (docs-db-admin `CREATE DATABASE … OWNER edms_owner`), and is the superuser in CI and compose. The integration spec creates its databases as the owner.
- **DR restore** (`dr-rehearsal.mjs`, unchanged).
  - `pg_restore --create` brings back `munaxa_meta` with its owner and ACL.
  - `apply-post-migrate` then adds a new completed run.
  - `edms_backup` (pg_read_all_data) can dump the new schema.
  - The checkpoints only SELECT from `public`.
- **Prisma 6.19.3.** I read the bundled CLI. `migrate status` exits 1 only when the database is behind, the histories diverge, a migration failed, or the database is unmanaged. A database *ahead* of the build falls through to success, so rolling back by re-running the older docs-migrate passes. `db execute --stdin/--file --schema` is supported. The new `munaxa_meta` schema is outside `public` and the datasource has no `schemas` list, so Prisma sees no drift. No migration or post-migrate SQL file is modified.
- **The API image finds its files.** The API image copies `prisma/` (which has `migration_lock.toml`) and `infra/sql/`. `locateUpwards` from `/app/apps/api/dist` reaches `/app`. An empty set of migrations or files refuses.
- **API start-up.** The gate runs before `app.listen`, so before any init hooks. A refusal exits 1, and the error text has URLs redacted. A single unreachable tenant refuses the start.
- **Provisioning.**
  - The gate runs before any write and exits 3.
  - A tenant missing from the catalogue is still refused by the service.
  - Exit 4 is the exact "already exists" duplicate.
  - Errors are redacted.
- **Platform `docs-migrate` task.**
  - It is a task definition only: `create_service=false`, no task role.
  - Root filesystem is read-only, all capabilities are dropped, no port or health check.
  - The one secret is `DATABASE_MIGRATION_URL` from `munaxa-<env>/docs-migrate`, with an optional version pin; it is never plain environment.
  - The execution role pulls only `munaxa-docs/migrate`, writes only its own log group and reads only its own secret.
  - Network: egress 443 and 5432 to the database security group only.
  - `images.docs_migrate` must be the `munaxa-docs/migrate` repository, by digest.
  - The platform workload boundary already allows pulls from `munaxa-docs/*`.
- **Release order.**
  - It is enforced procedurally by two applies (the module's `main.tf` is unchanged).
  - It also fails safe: if both digests are pinned in one apply, the new API tasks refuse to start and the circuit breaker rolls back.

### Verdicts (13)
1. **Credential exposure:** PASS. URLs go only through the environment; output is redacted for URLs and for passwords both encoded and decoded; there is no `--url` on any command line; no credential is baked into an image; verify C-1 covers it.
2. **Cross-tenant access:** PASS. One owner URL per tenant; the API's role cannot read the migration bundle; RLS is checked directly as well.
3. **IAM over-permission:** PASS. Least-privilege execution role, no task role, docs-api's role unchanged. The Docs bootstrap adds one repository to the publisher and boundary lists (an owner-approved apply).
4. **ECS secret references:** PASS. `arn:DATABASE_MIGRATION_URL::<version>`, covered by a tftest.
5. **Reproducibility and digest pinning:** PASS with L-7. The platform requires digests; the api and migrate images are a pair from the same revision and run.
6. **Prisma 6.19.3 compatibility:** PASS. Verified against the bundled CLI source.
7. **Ordering, failure handling, exit codes:** PASS. 0, 1 and 2 for migrate; 0, 1, 3 and 4 for provision; a run that fails or is killed stays open and refuses.
8. **Concurrency:** PASS with L-1. Prisma's advisory lock serialises the migrations; the post-migration SQL is not serialised, which is documented and forbidden.
9. **Destructive operations:** PASS. No reset, `db push`, `migrate dev`, `migrate resolve` or history rewrite (a test enforces this); migrations are unmodified. The only revokes are the `_prisma_migrations` write revoke and the `munaxa_meta` ACL.
10. **Runtime image bloat:** PASS. The API image is unchanged apart from the gate code in `dist`. The migrate image carries the full `node_modules`, which is documented and separate from the API.
11. **API start before migration:** PASS. It refuses before listening.
12. **Unintended changes to other products:** PASS. No change to Identity, Control, Work or School resources; no resource change in the nonprod or prod plans; output-only change per L-4.
13. **Docs/Platform naming compatibility:** PASS. `docs-migrate`, `munaxa-docs/migrate`, `images.docs_migrate`, `<env>/docs-migrate` and `/munaxa/<env>/docs-migrate` match on both sides.

### Overall
- **munaxa-docs#176:** APPROVE. Lows: L-1, L-2, L-3, L-6, L-7.
- **munaxa-platform#104:** APPROVE. Lows: L-4, L-5.