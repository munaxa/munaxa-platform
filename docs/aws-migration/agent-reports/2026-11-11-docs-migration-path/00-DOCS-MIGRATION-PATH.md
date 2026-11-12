# Docs database migration path (DC-01), 11 Nov 2026

**Status: DC-01 FIXED IN REPOSITORY CODE.** Nothing was deployed.

- **Docs migration image:** implemented and tested.
- **Platform `docs-migrate` one-off task:** implemented and tested with mocked Terraform.
- **Provisioning order:** enforced in code. Provisioning and API start-up refuse a database whose migration has not finished.

| Repository | PR | Final head | Squash merge on `main` |
| --- | --- | --- | --- |
| munaxa-docs | [#176](https://github.com/munaxa/munaxa-docs/pull/176) | `2593f61` | `0515667` (`05156679c725ce19182231a967c97bfd1678a85d`) |
| munaxa-platform | [#104](https://github.com/munaxa/munaxa-platform/pull/104) | `5c4bad6` (code), then this report | The squash commit of #104 (this report ships in the same PR) |

- **Requested by:** Tamer, 11 Nov 2026 19:26 UTC. The scope was repository work only.
- **Baselines:** munaxa-docs main `187f08a`, munaxa-platform main `c760f34`.
- **Independent review:** a separate reviewer agent ran six rounds. Its final verdict was **APPROVE for both PRs on the exact final heads**, with no Critical, High or Medium finding left and seven Lows (section 10).
- **CI:** all required checks were green on both final heads before each merge (section 11). The platform code is the reviewed head `5c4bad6`; the final platform head adds only this report.

No AWS API was called and no image was built for or published to ECR. No secret was created or read, no migration ran against a real database, and no workflow was dispatched (section 13).

---

## 1. The original finding and how it was verified

**DC-01 (High)** comes from `2026-11-11-cross-repository-deployment-readiness/supporting/docs.md` (platform#101). It found that the shared hosting had no way to migrate the Docs tenant database:

- The Docs runtime image is `FROM scratch` and contains only node and libc.
- The migration runner shelled out to `pnpm exec prisma`, which is not in any runtime image.
- Platform `docs.tf` and `CONTRACT.md` gave migrations to `docs-provision`.
- `provision.js` does not migrate. It refuses an unmigrated tenant ("migrate its database first").

The finding was re-verified from source on both mains before any change:

| Claim | Source checked | Result |
| --- | --- | --- |
| The runtime image has no Prisma CLI or package manager | munaxa-docs `Dockerfile` (`runtime` stage, `FROM scratch`) | Confirmed. Only `node`, libc and OpenSSL 3. |
| The migration runner needs pnpm | `scripts/migrate-tenants.mjs`, `apply-post-migrate.mjs` (`spawnSync('pnpm', ['exec','prisma',…])`) | Confirmed. It fails with `spawnSync pnpm ENOENT` in any image. |
| The platform delegates migrations to docs-provision | platform `infra/aws/stack/docs.tf` ("per-database grants, migrations and post-migrate SQL are docs-provision's job"), `CONTRACT.md` | Confirmed. |
| provision.js does not migrate | `apps/api/src/provision.ts` → `ProvisioningService.provision` | Confirmed. It refuses an unmigrated tenant. |
| No other route exists | platform `modules/service` (`enable_execute_command = false`), no ops tunnel, RDS not public | Confirmed. |

Two more gaps were found during verification and fixed in the same work:

- **Unchecked API start-up.** The API started against a database in any state, so it could become healthy on an unmigrated or half-migrated schema.
- **Credential exposure.** The runner passed the database URL as `--url` on the command line, where it could appear in process listings and error output.

## 2. Final architecture and migration sequence

There are three images from one commit, each with one job:

| Image (ECR repository) | Docker target | Job | Runs as |
| --- | --- | --- | --- |
| `munaxa-docs/api` | `api` | The API server and `provision.js`. It is unchanged except for the schema gate code. | ECS service `docs-api`, and one-off task `docs-provision` |
| `munaxa-docs/migrate` | `migrate` (new) | Grants, `prisma migrate deploy`, post-migration SQL and `prisma migrate status` | One-off task `docs-migrate` (new, never a service) |
| `munaxa-docs/web`, scanner | unchanged | | |

The hosted sequence is documented in `docs/operations/deployment.md` §2a, platform `docs.tf` and `CONTRACT.md`. Each step names what enforces it:

| # | Step | Enforced by |
| --- | --- | --- |
| 1 | Create or verify the tenant database and cluster roles (`docs-db-admin`) | Existing task, unchanged |
| 2 | Verify connectivity | `docs-migrate` fails with exit 1 (P1000) or 2 before it touches anything |
| 3 | Run `docs-migrate` | The operator, as one `aws ecs run-task` |
| 4 | Verify that the migration completed | Exit code `0` only after `migrate status` reports nothing pending or failed. Any other code stops the release. |
| 5 | Provision the tenant (`docs-provision`) | **The schema gate runs first.** Exit 3 (nothing written) on an unmigrated, failed or unfinished database; exit 4 if already provisioned. |
| 6 | Verify the schema and tenant state | The same gate checks the history, the post-migrate run record and forced RLS with `tenant_isolation` on every tenant table |
| 7 | The API becomes ready | **The API runs the gate before `listen`** and exits 1, so ECS never sees a healthy task on an unmigrated database. The deployment circuit breaker keeps the previous revision serving. |

**The schema readiness gate** is in `apps/api/src/core/prisma/schema-readiness.ts`. It passes only when all of these hold:

- Every migration the build carries is applied, and none has failed or is still running.
- The post-migration SQL completed after the newest applied migration. Each run of it is recorded in `munaxa_meta.post_migrate_run`, with its file hashes and a snapshot of the migrations applied at that point.
- No newer post-migration run is still open.
- The build's own versions of the post-migration files are the ones in effect.
- Every tenant table has forced RLS and a `tenant_isolation` policy.

A database that is ahead of the build, with only migrations it does not know, passes. That is the expand-only rollback case.

**The release is two applies**, because the `docs-api` service follows its task definition:

1. Pin `images.docs_migrate` only, then run `docs-migrate` and require exit 0.
2. Pin `images.docs_api`. This apply is the rollout.

On a first deployment, the service stays off (`services_enabled = false` or `desired_counts["docs-api"] = 0`) until provisioning has passed.

## 3. Files changed

**munaxa-docs#176** (21 files, +2198/−76):

| File | Change |
| --- | --- |
| `Dockerfile` | New `migrate-engines` and `migrate` targets. The API target is unchanged. |
| `scripts/migration-support.mjs` (new) | Runs the Prisma CLI by its own path, with no pnpm. The URL goes only in the child's environment, never on argv. All output is redacted. Defines the exit codes. |
| `scripts/migrate-tenants.mjs` | Grants, then `migrate deploy`, post-migrate SQL and `migrate status`. Exits 0, 1 or 2. Never runs reset, `db push`, `migrate dev` or `resolve`. |
| `scripts/apply-post-migrate.mjs` | Opens and closes the post-migrate run record around the files. Revokes `edms_app` write on `_prisma_migrations`. Validates names before running anything. |
| `apps/api/src/core/prisma/schema-readiness.ts` (new), `index.ts`, `tenant-database.ts` | The schema readiness gate |
| `apps/api/src/core/prisma/startup-schema-gate.ts` (new), `apps/api/src/main.ts` | The API refuses to start before `listen` |
| `apps/api/src/provision.ts` | Runs the gate before any write. Exits 0, 1, 3 (not migrated) or 4 (already provisioned). |
| `schema-readiness.spec.ts`, `schema-readiness.integration.spec.ts`, `startup-schema-gate.spec.ts`, `scripts/__tests__/migration-support.test.mjs` (new) | Unit, integration and script tests |
| `scripts/migration-image/verify.sh` (new) | 30 checks against the built images and disposable databases |
| `.github/workflows/ci.yml` | New job "Migration image · disposable databases". Script tests added to the node test step. |
| `.github/workflows/publish-images.yml`, `scripts/release-smoke/run.sh` | Publishes `munaxa-docs/migrate` from the same commit and run as `api`. The release smoke migrates with the published migrate digest. |
| `infra/terraform/bootstrap/ecr.tf` | Adds the `migrate` ECR repository. Applying it is an owner action. |
| `docs/operations/deployment.md` §2, §2a; `infra/sql/README.md` | Release, failure and rollback procedure; the run record |

No existing Prisma migration or post-migration SQL file was modified. The reviewer confirmed this, and a test enforces it.

**munaxa-platform#104** (8 files, +298/−12):

| File | Change |
| --- | --- |
| `infra/aws/stack/docs.tf` | New `module.docs_migrate` (one-off task). Header on order and the two applies. `docs_defined` now requires `images.docs_migrate`. |
| `infra/aws/stack/data.tf` | `<env>/docs-migrate` bundle with key `DATABASE_MIGRATION_URL`, created only when Docs is defined |
| `infra/aws/stack/variables.tf` | `images.docs_migrate`, validated as `…/munaxa-docs/migrate@sha256:…` |
| `infra/aws/stack/outputs.tf` | `run_task_network.docs_migrate_definition`, `docs_migrate_group` |
| `infra/aws/modules/service/outputs.tf` | `execution_role_grants` output, used by the tests |
| `infra/aws/stack/tests/stack.tftest.hcl` | Three new runs and three extended runs (40 total) |
| `infra/aws/CONTRACT.md`, `infra/aws/README.md` | `docs-provision` no longer migrates. Order and the two applies are documented. |

## 4. The migration Docker target

| Property | Value |
| --- | --- |
| Base | The same `runtime` stage as the API: `FROM scratch` with node 22 and libc/OpenSSL 3, **no shell, no package manager** |
| User | `node`, uid 1000 (verify I-4) |
| Prisma | `node_modules` copied from the API's own `build` stage. Prisma **6.19.3** from the lockfile, byte for byte. pnpm 10.33.0 and Node 22 are unchanged. |
| Schema engine | `migrate-engines` stage (`FROM build`, `PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x`). The CLI fetches the OpenSSL 3 schema engine for the lockfile's engine commit. Only the migrate image gets it, so the API image gains nothing (verify I-6). |
| Contents | `prisma/` (schema and 32 migrations), `infra/sql/`, and three scripts, byte-identical to the commit (verify I-3) |
| Entry point | `node scripts/migrate-tenants.mjs`, with no port and no health check |
| Run time input | `DATABASE_MIGRATION_URL` (or a tenant catalogue) from the environment. Nothing is baked in: no URL, `.npmrc` or `.env` (verify I-5). |
| Exit codes | `0` migrated and verified, `1` migration failed, `2` configuration error with nothing touched |
| Filesystem | Writes nothing. Runs with a read-only root and all capabilities dropped (verify M-9). |
| Identification | Same `org.opencontainers.image.revision` label and `<short>`/`sha-<full>` tags as the paired API image |

## 5. The ECS migration task

`module.docs_migrate` in `infra/aws/stack/docs.tf` uses `modules/service`, the same module as the other products' `<product>-migrate` tasks.

| Setting | Value |
| --- | --- |
| Count | `local.docs_defined ? 1 : 0`. It exists only when `hosts.docs` and every Docs image, `docs_migrate` included, are set. |
| Service | `create_service = false`: a task definition only, **never a service** |
| Image | `var.images.docs_migrate`, which must match `/munaxa-docs/migrate@sha256:` |
| CPU / memory | 256 / 1024 |
| Environment (plain) | `NODE_ENV=production`, `TENANT_SLUG` |
| Secrets (ECS `secrets`) | `DATABASE_MIGRATION_URL` from `munaxa-<env>/docs-migrate`, at the pinned version in `secret_version_ids["docs-migrate"]` when set |
| Task role | **None**, because migrating calls no AWS API |
| Execution role | Its own. It pulls only `munaxa-docs/migrate`, writes only `/munaxa/<env>/docs-migrate` and reads only the `docs-migrate` bundle. It uses the existing permissions boundary. |
| Logs | Its own log group, `/munaxa/<env>/docs-migrate` |
| Network | Its own security group: 5432 to the database security group and 443 out. Published as `run_task_network.docs_migrate_group`. |
| Container | Read-only root filesystem, all capabilities dropped, no port mapping, no health check, the image's own CMD |

## 6. Secret names (names only, never values)

| Secret (Secrets Manager) | Keys | Read by |
| --- | --- | --- |
| `munaxa-<env>/docs-migrate` (**new**) | `DATABASE_MIGRATION_URL` (the `edms_owner` URL for the tenant database) | Only the `docs-migrate` execution role |
| `munaxa-<env>/docs-api` | unchanged | `docs-api` and `docs-provision` (not the migration URL) |
| `munaxa-<env>/docs-operator`, `docs-provision/<slug>`, RDS master | unchanged | unchanged |

The new bundle is created empty by Terraform only when Docs is defined. **Filling it is an owner action.** No secret was created, read, generated or written in this work.

## 7. IAM and security review

- **Least privilege.** The new execution role has three grants: pull one repository, write one log group, read one secret. There is no task role.
  - The tests check that docs-api's role still reads only `docs-api`, never `docs-migrate`.
  - They also check that neither the API nor docs-provision can read the migration URL.
- **No plaintext credential.** The URL reaches the container only through ECS `secrets`. A test asserts the plain environment is exactly `NODE_ENV` and `TENANT_SLUG`.
  - In the image, the URL is passed to Prisma only through the child environment, never as `--url`.
  - All output is redacted of PostgreSQL URLs and passwords, encoded and decoded (verify C-1: none in 25 logs).
- **Cross-tenant access.** Each tenant has one owner URL. The API's role cannot read the migration bundle, and the gate checks RLS directly.
- **Database privilege.** `edms_app` can only read `munaxa_meta.post_migrate_run` and Prisma's history; it cannot write either (integration spec, verify M-10).
- **No destructive operation.** The image never runs `migrate reset`, `migrate dev`, `db push`, `--accept-data-loss` or `migrate resolve`. A failed migration stays failed: P3018, then P3009 on a re-run (verify M-4, M-5).
- **Concurrency.** Prisma's advisory lock serializes `migrate deploy` (verify M-8, repeated). The post-migration SQL is not serialized. A second copy either fails loudly (P2002) or leaves a run open that keeps the gate refusing, so the procedure forbids running two copies (L-1).
- **Other products.** No resource changes in the nonprod or prod plans. Config A1's ten bundles are unchanged, and no Identity, Control, Work or School resource changed.
- **Reviewer verdicts:** 13 of 13 areas PASS, three of them with a noted Low (section 10).

## 8. Database migration test results

All tests used disposable local databases (Docker `postgres:16-alpine` and a local PostgreSQL 16) and CI runners. No real database was touched.

**`scripts/migration-image/verify.sh`: 30 of 30 OK** locally on `2593f61` (`supporting/verify-sh-local-2593f61.txt`), and green in CI. The CI job "Migration image · disposable databases" builds the real Dockerfile.

The local build used a harness with packed `@munaxa/*` tarballs and an Ubuntu-based runtime filesystem, because the session has neither a GitHub Packages token nor Debian mirror access. CI is the authoritative build.

Mapping to the requested Docs tests:

| Requested test | Checks | Result |
| --- | --- | --- |
| 1 The migration image builds | CI image jobs "Container images" and "Migration image" | PASS |
| 2 The Prisma CLI is available | I-1 (6.19.3), I-2 (engine) | PASS |
| 3 The schema and migrations are present | I-3 (32 migrations, byte-identical) | PASS |
| 4 The runtime image stays minimal | I-5, I-6 (no shell, no extra engine in the API image) | PASS |
| 5 Fresh database migrates | M-1, M-2 | PASS |
| 6 A re-run is safe | M-3; M-8 (concurrent) | PASS |
| 7 Failure returns non-zero | M-4 (P3018 → 1), M-5 (P3009 on re-run), M-6 (P1000 → 1), M-7 (no URL → 2) | PASS |
| 8 Provisioning refuses after a failure | P-1, P-2, P-3, P-6 to P-10 (all exit 3, nothing written); A-1, A-3 (the API refuses) | PASS |
| 9 Provisioning succeeds after migration | P-4 (exit 0), P-5 (re-run → 4, unchanged); A-2 (the API starts) | PASS |
| 10 No credentials in logs | C-1 (25 logs) | PASS |

Other suites:

- API unit tests: 1039 passed, including 35 in the new gate specs.
- Integration (`schema-readiness.integration.spec.ts`, real PostgreSQL): 5 of 5.
- Script tests (`node --test`): 7 of 7.
- Lint, typecheck and format were clean.
- CI on `2593f61`: all 12 jobs green, including Integration, Release smoke (images from this commit, migrating with the migrate image) and every end-to-end leg.

## 9. Terraform test results

These are mocked tests only (`mock_provider`, `override_resource`), with `terraform init -backend=false`. No real backend and no AWS credentials were used.

- `terraform fmt -check` and `terraform validate`: clean.
- `terraform test` in `infra/aws/stack`: **40 passed, 0 failed**. The reviewer re-ran it and got 40 of 40.
- 8 mutations, each caught by a test:
  - swapping the bundle
  - putting the URL in plaintext
  - making the task a service
  - adding a task role
  - using the API image
  - defining Docs without the migrate image
  - tying the bundle to `hosts.docs`
  - making the root filesystem writable

Mapping to the requested platform tests:

| Requested test | Test run (`stack.tftest.hcl`) | Result |
| --- | --- | --- |
| 1 The task exists only when Docs is enabled | `docs_without_its_migration_image_is_not_defined`, `without_a_docs_host_there_is_no_docs` | PASS |
| 2 The correct image | `docs_migrate_runs_the_migration_image_with_only_its_owner_url`, `the_api_image_is_refused_as_the_docs_migration_image` | PASS |
| 3 The bundle is referenced correctly | same run ("DATABASE_MIGRATION_URL is the one secret, from the docs-migrate bundle at its pinned version") | PASS |
| 4 Injected as a secret | same run (plain environment has no URL) | PASS |
| 5 Not a service | same run, and `docs_runs_in_a_session_…` (a task definition only, even in a session) | PASS |
| 6 Minimal IAM | same run (execution role grants, no other bundle, no RDS master) | PASS |
| 7 Execution and task roles kept separate | same run (no task role; docs-api's role unchanged) | PASS |
| 8 API start-up dependency | same run ("With services off, the API is registered but not running"), plus the docs-side gate (A-1 to A-3) | PASS |
| 9 Expected plan changes declared | `nonprod.expected-changes.json` unchanged. Nonprod and prod plan dumps on main and on the branch have identical resources. | PASS |
| 10 Other products unchanged | `docs_without_its_migration_image_is_not_defined` (Config A1's ten bundles, G3 resources unchanged) and the plan comparison | PASS |

The only plan difference is two null-valued output keys in `run_task_network` (L-4). `check-plan-intent.sh` compares resources only.

## 10. Independent reviewer findings and resolutions

A separate reviewer agent, which did not implement the changes, reviewed the exact heads in six rounds. It ran tests offline and called no AWS API.

| Round | Finding (severity) | Resolution |
| --- | --- | --- |
| 1 | The gate covered only the first post-migration file (Medium) | A per-file run record with sha256 hashes in `munaxa_meta.post_migrate_run` |
| 1 | One apply with both digests rolls the API before the migration (Medium) | The release became two applies (docs §2a, platform `docs.tf`, CONTRACT, README) |
| 2 | The run record was not tied to the migrations it followed (Medium) | The run records the list of applied migrations. The gate refuses if a migration came after the last completed run. |
| 3 | A race: a concurrent or killed run could look complete (Medium) | The run is opened before the first file and closed after the last. The gate refuses while a newer run is open (P-9). |
| 3 | False refusal on rollback (Medium) | A database ahead of the build is accepted when a completed run covered the build's migrations |
| 4 | Reverted or older file versions could pass (Medium) | The build's own file versions must be the ones in effect (P-10). The rollback re-run is documented. |
| 5 | `edms_app` could write `_prisma_migrations`, which the gate trusts (Medium) | The write is revoked when the run opens and again when it closes (M-10, integration spec) |
| 6 | **APPROVE both.** Lows only. | Accepted and documented. See below. |

Round 6 Lows (full text in `supporting/independent-review-round6.md`):

- **L-1:** An overlapping older run of a different release can leave its file in effect unseen. This needs two copies at once, which the procedure forbids.
- **L-2:** On a fresh database, `edms_app` has a short window of write access to `_prisma_migrations` before the first revoke.
- **L-3:** A rollback past a release that added a migration and changed a file is accepted with the newer file in effect. This is the expand-only rule, and it is documented.
- **L-4:** Output-only plan change.
- **L-5:** The `docs-migrate` bundle follows the Docs images, not `hosts.docs`. It also duplicates the owner password held in `docs-operator`, so rotation must update both.
- **L-6:** Migration logs are buffered until each Prisma command exits.
- **L-7:** The OpenSSL 3 schema engine is fetched from Prisma's CDN at build time. A rebuild is not byte-reproducible, but deployment pins the result by digest.

None blocks a nonprod deployment. L-1, L-2, L-5 and L-6 are candidates for a later hardening PR.

## 11. PRs, CI and merge SHAs

| PR | Head | Required CI on the head | Merged |
| --- | --- | --- | --- |
| [munaxa-docs#176](https://github.com/munaxa/munaxa-docs/pull/176) | `2593f610997883a5f104ff340a3b45ba657b8a98` | Runs 43101503965 and 43101491688: all 12 jobs success | Squash, 11 Nov 21:24 UTC, `05156679c725ce19182231a967c97bfd1678a85d` |
| [munaxa-platform#104](https://github.com/munaxa/munaxa-platform/pull/104) | Code head `5c4bad6fe932feacbff80d42ec24bfc512e8b814`, then one report-only commit | Runs on the head that carries this report (CI, AWS Terraform mocked tests) | Squash into `main`; the commit that adds this file |

Merge order: docs first, so the image target exists before the platform references it.

Unrelated CI incidents on earlier heads were re-run and not bypassed:

- A curl reset fetching the PGDG key.
- A Chromium screenshot capture error.
- A GitHub artifact service error.
- A GitHub Actions stall: the platform `pull_request` runs for heads `8a6df7e` and `5c4bad6` (43095170043, 43095170091, 43097318166, 43097318187) stayed queued with no jobs from 20:18 UTC on 11 Nov until at least 03:20 UTC on 12 Nov. Re-run and cancel were refused by GitHub. Scheduled runs on `main` ran normally.

This report was added to #104 as a separate, Markdown-only commit after the reviewed code head `5c4bad6`. It is a real content change, not an empty commit, and it produces fresh `pull_request` runs. The code reviewed and approved is unchanged: `git diff 5c4bad6..<final head>` touches only this folder and the reports index.

## 12. Release and rollback instructions

The authoritative text is munaxa-docs `docs/operations/deployment.md` §2a. In summary:

1. Tag `image/<full sha>` on a reviewed `main` commit. `publish-images.yml` builds `api`, `web`, `migrate` and the scanner from that commit, pushes them by digest, and runs the release smoke with the migrate digest.
2. Record the pair `munaxa-docs/api@sha256:…` and `munaxa-docs/migrate@sha256:…`.
   - Both carry the same `org.opencontainers.image.revision` label and `sha-<full>` tag.
   - To find the migration image of any API release, look it up by revision: `aws ecr describe-images --repository-name munaxa-docs/migrate --image-ids imageTag=sha-<full>`.
   - Never mix revisions.
3. **First apply:** pin `images.docs_migrate` only. This registers the task and changes no service.
4. Back up the tenant database.
5. Run `docs-migrate` once with `aws ecs run-task`, using `run_task_network.docs_migrate_group`. Never run two copies.
6. Read `containers[0].exitCode`. **Only 0 continues.** The log is in `/munaxa/<env>/docs-migrate`.
7. On a first deployment, run `docs-provision`: 0 means provisioned, 4 already provisioned, 3 not migrated (back to step 5).
8. **Second apply:** pin the paired `images.docs_api` (and `docs_web`). This is the rollout.
   - On a first deployment, keep the service off until step 7 has passed.
   - A task that meets an unfinished database exits before its health check, and the circuit breaker keeps the old revision.

**A failed migration:** do not roll the API forward.

- No build starts a new task until `docs-migrate` completes, because every build's gate refuses. Replaced tasks do not come back.
- Fix the cause. An operator resolves the failed migration deliberately, against a backup-verified database (`prisma migrate resolve`; never the task).
- Then re-run `docs-migrate`.

**Rollback limits:**

- Rolling back means deploying the previous API digest. The migration is not undone, so this is safe only for expand-only migrations.
- A migration that is not backward-compatible has no image rollback. The way back is restoring the pre-migration backup into a new database and repointing.
- Rolling back a release that changed only a post-migration file needs the previous release's `docs-migrate` to run first (exit 0), then the previous API.

## 13. No AWS calls, image publication, migrations or deployments

During this task, none of the following happened:

- An AWS API call (the AWS connector was not used).
- Terraform against a real backend, `plan` with credentials, or `apply`.
- An AWS resource, IAM, KMS, network or security group change.
- A secret created, read, generated, rotated or deleted.
- An image built for or pushed to ECR. Only local Docker builds and the repositories' own CI builds ran; publishing is tag-triggered and no `image/*` tag was created.
- A workflow dispatched or an ECS task run.
- A migration run against a non-local database, or any change to production, staging or non-production data.
- A DNS or Cloudflare change.
- Docs enabled anywhere.

The nonprod and prod plans have no resource changes from this work.

## 14. Remaining owner actions before Docs can be hosted

Each needs separate, explicit owner approval. None is authorized by this task.

1. **Docs bootstrap apply** (munaxa-docs `infra/terraform/bootstrap`), which creates the `munaxa-docs/migrate` ECR repository and adds it to the publisher and boundary lists.
2. **Publish images** by tagging `image/<sha>` on a reviewed main commit at or after `0515667`.
3. **Platform change to define Docs:** set `hosts.docs` and all Docs image digests, including `images.docs_migrate`, in the environment's var-file through a reviewed PR. Then plan and apply. This creates the `docs-migrate` bundle and task definitions.
4. **Fill the secret** `munaxa-<env>/docs-migrate` (`DATABASE_MIGRATION_URL` for `edms_owner`), along with the other Docs bundles. Pin it in `secret_version_ids`.
5. **Run the session tasks in order:** `docs-db-admin`, then `docs-migrate` (exit 0), then `docs-provision` (exit 0 or 4). Then make the second apply, or turn the service on.
6. **The decision to enable Docs** in nonprod.
7. **Other audit findings still open for Docs:**
   - DC-02 (Redis)
   - DC-03 and DC-04 (backups and DR checkpoints), which are needed before production
8. **Optional hardening** from the Lows: L-1 (run lock), L-2 (fresh-database window), L-5 (bundle tied to `hosts.docs`, single owner password source), L-6 (streamed logs).

**Repository readiness:** Docs is **repository-ready for a future non-production deployment** with respect to DC-01. The migration path, its order and its failure handling are implemented, tested and merged. Hosting still needs the owner actions above.
