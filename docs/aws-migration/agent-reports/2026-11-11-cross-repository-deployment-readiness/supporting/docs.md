# munaxa-docs deployment readiness audit (11 Nov 2026)

Auditor scope: `/home/claude/munaxa-docs` on branch `claude/project-thread-8chfj0` (== origin/main `b8c7e25`), plus a
read-only look at `munaxa-platform/infra/aws`. No AWS calls, no Terraform runs, no pushes, no GitHub writes.

## 0. Repo facts

- **Name:** munaxa-docs ("Munaxa Docs", an EDMS). Visibility cannot be determined from the code. The workflows call
  `munaxa/munaxa-docs` (README terraform table).
- **main SHA:** `b8c7e25`. Local commits from this audit sit on top of it (section 9).
- **Workspace:** pnpm 10.33.0, Node >= 22.12. The apps are `@edms/api` (NestJS), `@edms/web` (Next.js) and
  `@edms/worker`. The packages are `@edms/domain`, `contracts`, `i18n` and `utils`. The Prisma schema is
  `prisma/schema.prisma`, with 32 migrations. It consumes `@munaxa/{licensing 0.2.0, crypto 2.4.1, platform 1.7.0,
  ui, tokens, theme, icons 1.1.1, config-*}` from GitHub Packages.
- **Recent merged PRs relevant to deployment** (git log):
  - #174 `b8c7e25`, #173 `64c999c`, #172 `1f47ba4`, #171 `626173d` and #169 `3959a26`: old Docs eu-prod
    retirement, stages 1 and 2 (31 Oct to 4 Nov 2026).
  - #168 `23139a7`: publish-images token, SHA pins and the cluster roles SQL pin.
  - #166 `406eaee`: outbound HTTP User-Agent and timeout test.
  - #165 `a0ae491`: Control Plane licensing for the api and ops-provision tasks.
  - #163 `9445afc`: production refuses `LICENSING_MODE=NONE`.
  - #164 `00a22be`: outbound TLS checked by hostname while keeping the pinned address.
  - #162 `3701acf`: signed revocation lists for the licence file.
  - #160 `a7f59c4`: the shared licensing contract (ADR-0026).
  - #159 and #157: the plan-intent check, and plan, review, apply.
  - #152 and #154: ECS hardening and runtime image slimming.
- **CI workflows:**
  - `ci.yml` (PR, push to main and `claude/**`):
    - **node job:** `pnpm audit --audit-level high`, format check, a sha256 check of `infra/sql/cluster/01-roles.sql`
      against the munaxa-platform copy, then lint, typecheck, test, build, `verify:styles` and Playwright visual
      tests.
    - **integration job:** real Postgres with two tenant databases, Redis, MinIO built from pinned source, and
      ClamAV with c-icap. It runs `migrate-tenants.mjs`, then `test:integration`.
    - **e2e shards.**
  - `publish-images.yml` (tag `image/<sha>`): builds api, web and antivirus. It pushes to ECR
    `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-docs/*` through the OIDC role
    `munaxa-docs-eu-prod-image-publisher`, behind the `image-release` environment.
  - `terraform-eu-prod.yml` (workflow_dispatch, main only, environment `production`): plan or apply for the
    `core`, `data` or `service` root in account 229251310592.
- **Published versions:** images by digest only. The last recorded release is `f8a8bea`
  (`infra/terraform/eu-prod/service/release.auto.tfvars`: the api, web and antivirus digests in the 229251310592
  ECR). No npm packages are published from this repo.

## 1. Findings

| ID | Sev | Location | Evidence | Impact | Remediation | Blocks | Status |
|---|---|---|---|---|---|---|---|
| DC-01 | High | munaxa-docs:Dockerfile:143 / docs/operations/deployment.md:36-40 / apps/api/src/provision.ts / munaxa-platform:infra/aws/stack/docs.tf:254, infra/aws/CONTRACT.md:81, infra/aws/modules/service/main.tf:344 | The runtime is `FROM scratch AS runtime` (only node and libc). The deployment guide says the migration runner "shells out to `pnpm exec prisma`, and the runtime images carry neither pnpm nor the Prisma CLI — running it inside one fails with `spawnSync pnpm ENOENT`". The platform docs.tf says "The per-database grants, migrations and post-migrate SQL are docs-provision's job", and CONTRACT.md says "`docs-provision` (Docs migrate and first administrator)". But `provision.ts` only calls `ProvisioningService.provision`, which refuses an unmigrated tenant: "Add it to the catalogue and migrate its database first." (provisioning.service.ts:104-113). The platform has `enable_execute_command = false`, no ops tunnel (the old Docs stack had `ops_tunnel`) and an isolated RDS. | In the shared hosting nothing can apply `infra/sql/database`, the 32 Prisma migrations or the post-migrate RLS and immutability SQL to the Docs tenant database. docs-provision would fail, so Docs cannot start in non-prod or prod there. | Add a Docs `migrate` image target (node, the Prisma CLI, `prisma/`, `infra/sql/`, `scripts/`, invoking prisma through node rather than pnpm). Add a `docs-migrate` run-only task in platform `docs.tf` before `docs-provision`, and correct CONTRACT.md. | nonprod + prod | open |
| DC-02 | High | munaxa-platform:infra/aws/stack/docs.tf (docs_redis_command, sidecars) / old munaxa-docs `git show 626173d:infra/terraform/eu-prod/service/ecs.tf` / docs/operations/backup-and-restore.md §1 / apps/api/src/core/security/rate-limit.guard.ts:28-29 | `exec redis-server ... --maxmemory-policy noeviction --save '' --appendonly no` runs as a sidecar inside every docs-api task. backup-and-restore.md: "a job enqueued but not yet consumed at the moment of loss — an index projection, a notification, a webhook fan-out, a preview render — is gone with it … prefer a Redis with persistence". rate-limit.guard.ts: a per-instance fallback "is indistinguishable from no limit once the deployment scales". | Every deploy, task replacement or OOM drops in-flight jobs: notifications, webhooks and previews are lost and not replayed. With `desired_count` > 1, each task has its own broker, rate-limit budget, permission-version cache and idempotency window, so limits and caches go incoherent. | Use one shared Redis or Valkey per environment (ElastiCache, with persistence or multi-AZ for prod), reached over TLS with AUTH. Keep desired_count 1 until then. | prod (nonprod OK at desired_count 1) | open |
| DC-03 | Medium | munaxa-docs:apps/api/src/modules/audit/infrastructure/storage-checkpoint.store.ts:34 / docs/operations/backup-and-restore.md §1 table / munaxa-platform:infra/aws/stack/docs.tf (task_role_policy) and storage.tf (noncurrent-versions) | `CHECKPOINT_ROOT = 'audit/checkpoints'` sits in the same document bucket. The task role has `"s3:DeleteObject"` on `${docs_bucket.arn}/*`. Lifecycle: `noncurrent_days = 30`. The doc table promises "Audit checkpoints: Written to a store the database cannot reach, 7 years". | A compromised API task can delete checkpoints, and the deletions become permanent after 30 days. The 7-year retention is not met by any infra. | Use a separate checkpoint bucket (or prefix) with Object Lock (compliance mode) and 7-year retention. Grant the API Put only, with no Delete. | prod | open |
| DC-04 | Medium | munaxa-docs:docs/operations/backup-and-restore.md §1 / munaxa-platform:infra/aws/stack/storage.tf, data.tf:107 | Required: object storage "Versioning + cross-region replication, RPO 15 min, RTO 4 h", and a per-tenant logical dump "as `edms_backup`". Platform: versioning with 30-day noncurrent expiry, and no replication resource (`grep replication` finds nothing). `edms_backup` is created by docs-db-admin, but no scheduled dump task exists. | The documented RPO and RTO for objects and per-tenant restore are not achievable in the target hosting. | Decide the backup policy for Production. Add S3 replication (or AWS Backup for S3), a scheduled per-tenant `pg_dump` task, and the RDS PITR retention, then run `scripts/dr-rehearsal.mjs` and `storage-backup.mjs`. | prod | open |
| DC-05 | Medium | munaxa-docs:.github/workflows/terraform-eu-prod.yml / publish-images.yml / infra/terraform/bootstrap/* / eu-prod/*/expected-changes.json, service/*.auto.tfvars | The workflow is still dispatchable (`workflow_dispatch`, main only, `environment: production`). It assumes `munaxa-docs-eu-prod-ci` and then the deployer in 229251310592 (per CLAUDE.md, the Organizations management account). The roots contain no `resource`, `data` or `module` blocks (grep is empty), so a plan or apply now is a no-op and cannot recreate anything by itself. Recreation needs a revert of #172 merged to main plus an approved dispatch. `expected-changes.json` still declares deletes, and `launch.auto.tfvars` and `release.auto.tfvars` still carry the old images and URLs. publish-images can still push to the kept ECR on an `image/*` tag. | There is no accidental recreation path today. A live, privileged CI and deployer path into the management account stays for a product that was moved to a future Production account, and the stale intent files and tfvars invite mistakes. | Disable both workflows (`gh workflow disable`) or delete them. Empty the stale tfvars and intents. Plan the retirement of the bootstrap CI, deployer and publisher roles and the ECR once the new Production account exists. | neither (hygiene; owner decision) | open |
| DC-06 | Medium | munaxa-docs:apps/api/src/core/config/configuration.ts:141,447,468 / .env.example:74,148,154 | `JWT_ACCESS_SECRET: z.string().min(32)`. The placeholders `replace-me-with-at-least-32-characters` (38 characters) and `change-me-at-least-thirty-two-characters` passed the length rule, so production booted with them. | A production configured from the example would sign tokens and audit checkpoints with a published string. | Production refuses these values by name. Test: `configuration.spec.ts` "refuses the .env.example secret placeholders in production, and only there". | prod | fixed-in-local-commit 44350da |
| DC-07 | Medium | munaxa-docs:apps/api/src/core/tenancy/tenant-placement.ts:182,206 / tenant-scoped-storage.ts:172-180 / infrastructure.module.ts:95-104 / .env.example:81-83 | The catalogue `storage.container`, `driver`, `region` and `endpoint` are required and validated, but only `placement.storage.prefix` is used. The adapter is built once from `STORAGE_BUCKET`. `.env.example`: "a shared bucket and a bucket per company are the same code path." | An operator who gives a tenant its own bucket in the catalogue still gets its objects in `STORAGE_BUCKET`, so tenant data residency or isolation by bucket is silently not applied. Prefix isolation itself is enforced (scope() refuses `..` and double prefixes, and unscope() checks the prefix). | Either refuse a catalogue container or driver that differs from `STORAGE_BUCKET` and `STORAGE_DRIVER` at boot, or honour it. Correct `.env.example` either way. | neither | open |
| DC-08 | Medium | munaxa-docs:apps/worker/src/worker.module.ts / main.ts / Dockerfile:233-254 / docs/operations/deployment.md:78-82 vs go-live-runbook.md:321 | `@Module({}) export class WorkerModule {}`. `main.ts` logs "Consumers run in the API process" and exits. The worker target installs LibreOffice and Tesseract, which nothing in that process calls. The runbook says these binaries are needed "**in the API image**, which does not carry them". | Background processing runs only inside the API (`QUEUE_CONSUMERS_ENABLED=true`). The worker image is dead weight, and an orchestrator will treat it as a crash loop. Office previews and OCR cannot be enabled in hosted Docs. deployment.md contradicts the runbook. | Do not deploy the worker. Fix deployment.md §1 to match the runbook. Later, compose the consumers into the worker, or add an api-office image. | neither | open |
| DC-09 | Low | munaxa-docs:.env.example:97-101 (before) / configuration.ts:166-189 | The example omitted `STORAGE_CREDENTIALS_SOURCE` and said "a deployment on an instance role supplies neither". Under the default `STATIC`, no role is read, so the first signature fails. | Misleading env documentation for exactly the ECS setup the infra uses. | The local commit documents `STORAGE_CREDENTIALS_SOURCE` (STATIC or ECS_TASK_ROLE) and corrects the comment. | neither | fixed-in-local-commit 6f1643f |
| DC-10 | Low | munaxa-docs:infra/terraform/README.md "Status" / eu-prod/*/retired.tf:4 | The README table still read "Applied …" for core, data and service. retired.tf said "commit af58195 (stage 1)", and `git cat-file -t af58195` gives "Not a valid object name". | Docs do not match reality, and the pointer to the as-built configuration was dangling. | The local commit adds a retirement banner and points to `626173d` (== `1f47ba4^`). | neither | fixed-in-local-commit 6f1643f |
| DC-11 | Low | munaxa-docs:apps/api/src/modules/identity/infrastructure/jwt.token-service.ts / configuration.ts:138-141 / infrastructure.module.ts:87 | Own auth: HS256 with one `JWT_ACCESS_SECRET`. The comment "Rotated by adding a key, never by editing one" has no multi-key support. The same secret signs LOCAL transfer tokens. signOut revokes only the refresh family, so the access token lives until `exp` (default 900 s) unless `permVersion` changes. | Rotating the secret signs everyone out. Logout is not immediate. Docs does not use Munaxa Identity (no shared SSO). | Accept for launch, or add kid-based multiple verification keys. Decide whether Docs should federate to Identity (OIDC federation exists per tenant). | neither | open |
| DC-12 | Low | munaxa-docs:docs/architecture/adr/0025-production-email-amazon-ses-smtp.md:57 vs 9e5b8c6 and platform docs.tf `MAIL_DRIVER = "RESEND"` | The ADR says "Resend is not part of the production plan." Both the infra and the owner decision (#146) use Resend. | The ADR is stale and the decision record is contradictory. | Amend ADR-0025 or supersede it. | neither | open |
| DC-13 | Low | munaxa-docs:apps/api/src/modules/storage/application/storage.service.ts:130-140 vs 272-345 | The type sniff uses client-supplied `magicBytes` at session creation. Completion checks size and digest but does not re-sniff the stored object. | A client can store bytes whose type differs from what it declared. This is mitigated: `Content-Type` is signed into the PUT, download requires `ScanStatus.CLEAN` (reachability.ts:38-49), the filename is sanitised (`[\\/:*?"<>|]` replaced), downloads default to attachment, and URLs are single-key with a 300 s TTL (30-3600). | Re-sniff the first bytes after completion, before the scan. | neither | open |
| DC-14 | Low | munaxa-docs:apps/api/src/core/config/configuration.ts:632 | The comment says "Its host must also be on `OUTBOUND_HTTP_ALLOWLIST`", but there is no boot check. The old Terraform had a precondition. The platform builds the allowlist from `hosts.control_api`. | A mistyped allowlist makes every entitlement lookup unreachable. Access then degrades by the SaaS availability policy instead of failing at boot. | Add a boot check in CONTROL_PLANE mode. | neither | open |
| DC-15 | Low | munaxa-docs:configuration.ts:159 / infrastructure.module.ts:105-107 | `STORAGE_DRIVER` accepts `AZURE_BLOB` and `GCS`, and production refuses only `NONE`. The code says they "fail at first use". | A misconfiguration is found at the first upload, not at boot. | Refuse them in production until adapters exist. | neither | open |
| DC-16 | Low | munaxa-docs:apps/api/src/core/observability/health/health.service.ts | Readiness reports `DOWN` if any one tenant database is down, and `/api/health` (public) lists `database:<slug>` for every tenant. | If an LB used `/ready`, one tenant's outage would remove the whole fleet. Tenant slugs are disclosed. Both old and platform infra use `/api/health/live` and do not route `/api/health` publicly, so the impact is limited. | Keep the LB on `/live`, consider degrading per-tenant failures, and make the detail endpoint require a token (as metrics does). | neither | open |
| DC-17 | Low | munaxa-docs:infra/terraform/eu-prod/data/expected-changes.json (git history of rds.tf: `skip_final_snapshot` false) | The final snapshot `munaxa-docs-eu-prod-pg-final` was kept, and the data KMS key is scheduled for deletion (30-day window). | If the snapshot is encrypted with that key, it becomes unrestorable after the key is deleted, yet it still incurs storage cost. **Not verified (no AWS access).** | The owner should confirm whether the snapshot is wanted, and delete it or copy it under another key before the key deletion completes. | neither | open |
| DC-18 | Low | munaxa-docs:Dockerfile:189-197 | `COPY --from=build /app/node_modules` comes from a full (dev-inclusive) `pnpm install`. | Larger image and attack surface, with dev tooling in the runtime. | `pnpm deploy --prod`, or a prune stage. | neither | open |
| DC-19 | Low | munaxa-docs:apps/api/.storage/** (git ls-files) vs .gitignore:90 | Two empty e2e blobs were committed on 2026-08-09, although `.gitignore` lists `apps/api/.storage/`. | Repository hygiene only (.dockerignore excludes `.storage`). | `git rm --cached`. | neither | open |
| DC-20 | Info | pnpm audit | `1 vulnerabilities found Severity: 1 moderate` (minimatch via @munaxa/config-eslint, a dev path). | The CI gate is `--audit-level high`, so it passes. | Bump in munaxa-platform config-eslint. | neither | open |
| DC-21 | Info | munaxa-platform:infra/aws/stack/envs/nonprod.tfvars:54 | The comment says "the digest Docs Production runs (munaxa-docs launch.auto.tfvars)", but Docs Production is retired. | A stale reference (platform repo, read-only for this audit). | Reword in the platform repo. | neither | open |

## 2. Verified areas

- **Authentication and authorization.** Docs runs its own identity (apps/api/src/modules/identity): email and
  password with scrypt, TOTP MFA (sealed with `MFA_TOTP_SEALING_KEY`), per-tenant OIDC federation
  (`FEDERATION_REDIRECT_URI`), and API keys. It does not use Munaxa Identity JWTs.
  - **Access tokens:** HS256, `iss=JWT_ISSUER` (default `https://docs.munaxa.com`), `aud=JWT_AUDIENCE`
    (default `munaxa-docs`). Claims: `sub`, `tenantId`, `roles`, `permissions`, `sessionId`, `permVersion`, `iat`,
    `exp`. The algorithm is a constant and the signature is checked before the header. One error message covers
    every rejection.
  - **Revocation:** a per-request `permVersion` check against Redis or the database (AuthenticationGuard). It fails
    closed on a Redis error (cached-permission-version.reader.ts:45). Refresh-token families are revoked on
    sign-out.
  - **Global guard order** (app.module.ts:145-153): RateLimit, Authentication (closed by default, `@Public(reason)`
    needed), TenantIsolation (refuses a `tenantId` in query, body or params that differs from the token's),
    Entitlement, Rbac, Acl.
  - **Rate limit:** fails closed on credential routes and open elsewhere (rate-limit.guard.ts:77-90).
- **Licensing.**
  - **Modes:** `LICENSING_MODE` is `NONE`, `LICENSE_FILE` or `CONTROL_PLANE`. The default is `NONE`, and
    production refuses it (verified by booting dist/main.js with `NODE_ENV=production`).
  - **CONTROL_PLANE:** a GET to `${CONTROL_PLANE_URL}` (entitlementsPath for `docs` and the tenant) with a bearer
    `CONTROL_PLANE_TOKEN` and a 3 s timeout. The snapshot is cached in Postgres, memoised for
    `LICENSING_REFRESH_SECONDS`, and degraded through `SAAS_AVAILABILITY_POLICY` when Control is unreachable.
  - **LICENSE_FILE:** 0 days fresh, 7 days no-growth, 30 days read-only.
  - **Guard:** `EntitlementGuard` is global. GET, HEAD and OPTIONS count as READ and other methods as WRITE.
    Features come from decorators, and API_ACCESS applies to API-key callers. Quotas are enforced under an
    advisory lock.
- **Prisma and migrations.**
  - `prisma validate` passed.
  - All 32 migrations, the database SQL and the post-migrate SQL applied cleanly through
    `scripts/migrate-tenants.mjs` to two disposable tenant databases (PG 16.15, port 55434).
  - `prisma migrate status` reports "Database schema is up to date!".
  - RLS is enabled and forced on 78 of 79 public tables. The exception is `tenant`, which is
    database-per-tenant (ADR-0015).
  - `edms_app` has `rolbypassrls = f`.
  - `migrate diff` shows the expected drift Prisma cannot express: partial indexes, raw-SQL FKs and array
    defaults. This is not a defect.
- **Tenant isolation.** One database per tenant through the catalogue, PostgreSQL RLS as defence in depth, and
  storage keys prefixed per tenant by `TenantScopedStorage`. Object keys are content-addressed
  (`blobs/aa/bb/<sha256>`) under that prefix.
- **Storage.**
  - **Drivers:** S3 and R2 share one adapter, which presigns with its own SigV4 implementation. LOCAL streams
    through the API with signed capabilities.
  - **Hosted configuration:** `STORAGE_DRIVER=S3`, `STORAGE_BUCKET` (platform: `munaxa-<env>-docs-files-<account>`;
    old: `munaxa-docs-eu-prod-docs-229251310592`), `STORAGE_REGION`, `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE`,
    and `STORAGE_PUBLIC_URL`.
  - **Upload limits:** up to 2 GiB by default, with per-family ceilings (32 MiB text up to 512 MiB PDF). The limit
    is capped at `AV_ICAP_MAX_BYTES` (128 MiB) under ICAP (storage.service.ts:1072-1077).
  - **Scanning:** ICAP to the ClamAV and c-icap sidecar service. Files that are not `CLEAN` cannot be downloaded,
    and a failed scan is retried.
- **Email.** `MAIL_DRIVER=RESEND` (`MAIL_RESEND_API_KEY`, `MAIL_FROM_ADDRESS=docs@notify.munaxa.com`) or SMTP. In
  production SMTP requires STARTTLS or TLS and certificate validation, and `NONE` is refused.
- **Health checks.**
  - `/api/health/live` touches no dependency and is used by the Dockerfile HEALTHCHECK and by the ALB in both
    infra designs.
  - `/api/health/ready` returns 503 if any tenant database (up to the max tenant clients), the registry or the
    cache is DOWN. AV DOWN counts only as DEGRADED.
  - `/api/health` gives the same report with detail.
  - The web image has no image HEALTHCHECK. The platform probes `/login`.
- **Old infra vs app needs.** The old stack matched the app: S3 with CORS GET/PUT, `x-amz-checksum-sha256` and
  ETag exposed, versioning; RDS PG16 single-AZ `db.t4g.micro`, 35-day backups; Resend; an ICAP scanner service;
  and an API with a Redis sidecar and consumers in-process (no worker service). The platform `docs.tf` copies it
  one for one. Its gaps are DC-01 (migrations), DC-02 (Redis), DC-03 and DC-04 (backups and checkpoints).

## 3. Complete / partial / missing

- **Complete:**
  - Production config validation.
  - Licensing enforcement.
  - Own auth, MFA, revocation.
  - RLS plus database-per-tenant.
  - Presigned S3 path with mandatory AV.
  - Migrations themselves.
  - Images (api, web, antivirus) and their CI.
  - Release smoke harness.
- **Partial:**
  - Backup and DR: scripts and docs exist, but there is no infra for replication, dumps or Object Lock.
  - Background processing: in the API only, on an ephemeral Redis.
  - The catalogue storage placement (DC-07).
  - JWT rotation.
- **Missing:**
  - A migration execution path in the target hosting (DC-01).
  - A shared persistent Redis.
  - A real worker.
  - Office and OCR in hosted images.
  - An immutable checkpoint store.

## 4. Env var NAMES

**API (hosted, CLOUD), required or set by infra:**

- `NODE_ENV`, `PORT`, `NODE_OPTIONS`, `LOG_LEVEL`
- `DEPLOYMENT_PROFILE`, `TENANT_CATALOGUE` | `TENANT_CATALOGUE_PATH`
- `DATABASE_URL` (always required by the schema), `DATABASE_POOL_SIZE`
- `REDIS_URL`, `QUEUE_CONSUMERS_ENABLED`
- `JWT_ACCESS_SECRET`
- `CORS_ORIGINS`, `WEB_BASE_URL`, `TRUST_PROXY`
- `STORAGE_DRIVER`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_CREDENTIALS_SOURCE`,
  `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` (set by ECS), `STORAGE_PUBLIC_URL`
- `MAIL_DRIVER`, `MAIL_FROM_ADDRESS`, `MAIL_RESEND_API_KEY`
- `AV_DRIVER`, `AV_ICAP_URL`
- `OPENAPI_ENABLED` (must be `false`)
- `METRICS_DRIVER`, `METRICS_SCRAPE_TOKEN`
- `LICENSING_MODE`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`, `OUTBOUND_HTTP_ALLOWLIST`
- `SIGNATURE_WITNESS_SECRET`, `AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`

**API, on-premise alternatives:**

- Single tenant: `TENANT_SLUG`, `TENANT_ID`
- Local storage: `STORAGE_LOCAL_ROOT`
- Static storage keys: `STORAGE_ENDPOINT`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_ACCESS_KEY_ID`,
  `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_SESSION_TOKEN`
- SMTP: `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_SECURITY`, `MAIL_SMTP_USERNAME`, `MAIL_SMTP_PASSWORD`,
  `MAIL_SMTP_REJECT_UNAUTHORIZED`, `MAIL_SMTP_CLIENT_NAME`
- Licence file: `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_ALGORITHM`, `LICENSE_INSTALLATION_ID`,
  `LICENSE_REVOCATION_PATH`

**Optional tuning:** every other key in configuration.ts:36-678 (`DATABASE_*`, `OUTBOX_*`, `QUEUE_RECOVERY_*`,
`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_*_TTL_SECONDS`, `STORAGE_*`, `SEARCH_*`, `ACL_*`, `MFA_*`, `OCR_*`, `OFFICE_*`,
`PREVIEW_*`, `AUDIT_*`, `REPORTING_*`, `RATE_LIMIT_*`, `OUTBOUND_HTTP_*`, `METRICS_*`, `LICENSING_REFRESH_SECONDS`,
`FEDERATION_REDIRECT_URI`, `APP_NAME`, `APP_VERSION`). `SENTRY_DSN` and `OTEL_EXPORTER_OTLP_ENDPOINT` are refused
if set.

**Gaps in .env.example** (before the fix, or still open):

- Fixed in 6f1643f: `STORAGE_CREDENTIALS_SOURCE`.
- Still absent:
  - `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` (set by ECS, fine)
  - `JWT_ISSUER`, `JWT_AUDIENCE`
  - `RATE_LIMIT_*`, `MFA_*` tuning, `ACL_*`
  - `DATABASE_STATEMENT_TIMEOUT_MS`
  - `REPORTING_*`
  - `APP_NAME`, `APP_VERSION`

**Other processes:**

- **Web:** `NODE_ENV`, `PORT`, `NEXT_PUBLIC_API_URL` (read server-side only; no client component imports
  api-client), `WEB_TRUST_PROXY`.
- **Migration runner:** `DATABASE_MIGRATION_URL` or an operator `TENANT_CATALOGUE`/`TENANT_CATALOGUE_PATH` with
  migration URLs, and `TENANT_SLUG`.
- **Provision:** `TENANT_SLUG`, `TENANT_NAME`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (+ `TENANT_ID` in
  single-tenant form).
- **docs-db-admin (platform):** `PGUSER`, `PGPASSWORD`, `EDMS_OWNER_PASSWORD`, `EDMS_APP_PASSWORD`,
  `EDMS_BACKUP_PASSWORD`, `TENANT_DATABASE`.
- **Redis sidecar:** `REDIS_PASSWORD`.
- **DR scripts:** `DR_DEST_ADMIN_URL`.

## 5. Secret NAMES

- **App bundle** (platform `munaxa-<env>/docs-api`; old `aws_secretsmanager_secret.app`): `DATABASE_URL`,
  `TENANT_CATALOGUE`, `REDIS_URL`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `SIGNATURE_WITNESS_SECRET`,
  `AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`, `METRICS_SCRAPE_TOKEN`, `MAIL_RESEND_API_KEY`,
  `CONTROL_PLANE_TOKEN`.
- **Operator bundle** (`munaxa-<env>/docs-operator`): `EDMS_OWNER_PASSWORD`, `EDMS_APP_PASSWORD`,
  `EDMS_BACKUP_PASSWORD`, plus the RDS master secret (RDS-managed).
- **Provision** (`munaxa-<env>/docs-provision/<slug>`, one run): `TENANT_ID`, `ADMIN_EMAIL`, `ADMIN_NAME`,
  `ADMIN_PASSWORD`.
- **Operator catalogue:** carries the owner migration URLs (DC-01 needs a home for it).
- **Optional:** `MAIL_SMTP_PASSWORD`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_SESSION_TOKEN`.
- **GitHub:** `PLATFORM_PACKAGES_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `GITHUB_TOKEN`.

## 6. Startup dependencies and failure behaviour

- **Boot:**
  - Config validation must pass, or the process fails to start with a list of issues.
  - The tenant catalogue must parse.
  - Postgres per tenant is reached lazily, and readiness probes it.
  - Redis is needed by BullMQ, the rate limiter, the permission-version cache and queue recovery.
  - The ICAP scanner is optional at boot, and readiness reports it as DEGRADED.
  - Control Plane is called lazily.
- **Postgres down:** readiness returns 503 and requests fail.
- **Redis down:**
  - Sign-in and signature routes are refused (rate limiter fails closed).
  - Other routes skip the limit.
  - Authenticated web requests fail, because the permission-version check does not fail open.
  - Queue state is rebuilt by `QueueRecoveryScheduler` on reconnect. Enqueued-but-unconsumed jobs are lost.
- **Scanner down:** uploads finish as FAILED and cannot be downloaded until a rescan.
- **Control down:** the cached snapshot is used under SaaS availability rules, and access eventually degrades.
- **Resend down:** mail fails; the timeout is `MAIL_TIMEOUT_MS`.

## 7. Commands run (scratch copy `<audit-scratch>/audit/docs-work/docs`)

- **Platform build:** munaxa-platform `pnpm install --frozen-lockfile && pnpm build` gave 21/21 tasks OK. I packed
  27 `@munaxa/*` tgz files and installed docs with `pnpm.overrides` file: and `--no-frozen-lockfile`. Install
  succeeded (GitHub Packages 401 avoided).
- **Static checks:**
  - `turbo run typecheck`: 13/13 OK.
  - `turbo run lint`: 13/13 OK, 0 errors and 30 warnings (web no-console).
  - `pnpm format:check`: OK except the scratch `package.json` modified for the overrides. Originals are clean, and
    prettier on the edited files is clean.
- **Unit tests** (`turbo run test`): all pass.
  - api 80 files, 1009 tests (1010 after my test)
  - web 44 files, 523 tests
  - domain 164, contracts 63, i18n 80, utils 38, worker 2
- **Build:** `turbo run build` gave 9/9 OK, with Next.js generating 40 pages.
- **Database and migrations:**
  - Disposable PG16 on 55434: `01-roles.sql` OK, and the sha256 matches.
  - `migrate-tenants.mjs` over two tenants: OK.
  - `prisma migrate status`: up to date. `prisma validate`: OK. The RLS query was as above.
- **Integration tests** (`vitest --config vitest.integration.config.ts`, PG 55434, Redis 56384): 55/59 files pass,
  1172 pass and 49 fail.
  - All 49 failures are `ECONNREFUSED` to the absent MinIO, or to the ICAP scanner, which was not installed:
    `antivirus.e2e` 24, `icap-antivirus` 8, `s3-upload-integrity` 4, `storage-integrity-and-reclamation` 13.
  - Not run: e2e (Chromium), visual tests.
- **Production boot check:** `node apps/api/dist/main.js` with `NODE_ENV=production` refuses as designed (the list
  is in section 2).
- **Dependency audit:** `pnpm audit --audit-level high` passes; there is 1 moderate.
- **Docker:** the daemon is unavailable (`/var/run/docker.sock` missing), so no image build.

## 8. Proposed decision

**NOT READY** for the shared-platform non-production or Production hosting.

- The application code is in good shape: it validates, migrates and tests cleanly, and its auth, licensing,
  isolation and upload controls are fail-closed.
- **What blocks:**
  - DC-01: there is no migration path in the target hosting, so the documented `docs-provision` would fail.
    This blocks non-production.
  - DC-02, DC-03 and DC-04 additionally block Production: ephemeral per-task Redis, a mutable checkpoint store,
    and no object replication or tenant dumps.
- **After DC-01 is fixed:** READY FOR NON-PRODUCTION at `desired_count` 1, with `OFFICE_DRIVER` and `OCR_DRIVER`
  left at `NONE`.

## 9. Local commits (not pushed)

- `44350da` Refuse the .env.example secret placeholders in production. Tests: `configuration.spec.ts` 67/67, the
  api unit suite 1010/1010, api `tsc --noEmit` and eslint `src/core/config` all OK.
- `6f1643f` Docs: STORAGE_CREDENTIALS_SOURCE in .env.example; record the eu-prod retirement. Covers
  `.env.example`, the terraform README banner and the three retired.tf commit pointers. Prettier was clean on the
  README.
