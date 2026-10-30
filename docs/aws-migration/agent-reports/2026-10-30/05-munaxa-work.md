# 05: munaxa Work, AWS Testing readiness (Agent 5)

- **Report date:** 2026-10-30. Refreshed against live GitHub state at 15:25 UTC.
- **Agent:** Agent 5, munaxa Work.
- **Repository:** [munaxa/munaxa-work](https://github.com/munaxa/munaxa-work). `main` is at
  [`da84612`](https://github.com/munaxa/munaxa-work/commit/da84612ed0187e9e08d9df1971f75111f8270073).
- **Compared against:** munaxa-platform `main` at
  [`c4a1ad0`](https://github.com/munaxa/munaxa-platform/commit/c4a1ad0) (platform#26), and the shared contract
  `aws-testing/SHARED-CONTRACT.md` as of 14:25 UTC.

Labels used below: **[V]** means verified in this session from the repository, GitHub or a local run. **[A]** means an assumption, or
evidence carried over from an earlier session and not re-run. **[R]** means a recommendation.

## 1. Scope and what was inspected

This was a read-only audit of Work's readiness for the shared AWS Testing stack, plus small fixes by PR. The audit covered:

- the Dockerfiles and image targets
- the ECR and GHCR publish workflows and CI
- the environment schema
- health checks
- database roles, migrations, runtime grants and row-level security (tenant isolation)
- first-tenant provisioning
- Identity token verification
- Control Plane licensing
- the admin → API path

I also cross-checked the matching parts of munaxa-platform `infra/aws/stack`, munaxa-control and munaxa-identity.

## 2. Current implementation status

**Ready for AWS Testing as far as code goes. Nothing is in progress.** [V] Every variable, secret key, port, health path, ALB
route, service-discovery name and database role that the platform stack gives Work (platform `c4a1ad0`) matches what the Work
code reads. Platform#26 did not change Work's service definitions. Work has no open PRs. Work is not deployed: no image
has been published, and no AWS resource exists for it.

## 3. Files and components reviewed

| Component | Files |
|---|---|
| API image (runtime + `migrate` target) | [`apps/api/Dockerfile`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/Dockerfile) |
| Admin image | [`apps/admin/Dockerfile`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/admin/Dockerfile) |
| Env schema (API) | [`packages/config/src/environment.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/packages/config/src/environment.ts), [`licensing.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/packages/config/src/licensing.ts) |
| Env schema (admin) | [`packages/config/src/portal-environment.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/packages/config/src/portal-environment.ts) |
| Bootstrap, prefix, versioning, Swagger | [`apps/api/src/main.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/main.ts), [`application.setup.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/application.setup.ts) |
| Health | [`apps/api/src/health/health.controller.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/health/health.controller.ts) |
| Identity tokens | [`apps/api/src/identity/platform-token-authentication.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/identity/platform-token-authentication.ts), `platform-grants.ts` |
| Licensing | [`apps/api/src/licensing/licence.source.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/licensing/licence.source.ts), `usage.reporter.ts` |
| Admin → API | [`apps/admin/src/shell/api-request.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/admin/src/shell/api-request.ts), `platform-session.ts` |
| Documents storage | [`apps/api/src/documents/documents.composition.ts`](https://github.com/munaxa/munaxa-work/blob/da84612/apps/api/src/documents/documents.composition.ts) |
| DB: RLS and the resolver role | [`prisma/migrations/00000000000000_foundation`](https://github.com/munaxa/munaxa-work/tree/da84612/prisma/migrations/00000000000000_foundation), [`20260901090000_membership_resolution_role`](https://github.com/munaxa/munaxa-work/tree/da84612/prisma/migrations/20260901090000_membership_resolution_role) (34 migrations in total) |
| Runtime grants and runbook | [`deploy/aws/runtime-grants.sql`](https://github.com/munaxa/munaxa-work/blob/da84612/deploy/aws/runtime-grants.sql), [`deploy/aws/README.md`](https://github.com/munaxa/munaxa-work/blob/da84612/deploy/aws/README.md) |
| Tenant bootstrap | [`scripts/bootstrap-tenant.mjs`](https://github.com/munaxa/munaxa-work/blob/da84612/scripts/bootstrap-tenant.mjs) |
| Workflows | [`ci.yml`](https://github.com/munaxa/munaxa-work/blob/da84612/.github/workflows/ci.yml), [`publish-images-ecr.yml`](https://github.com/munaxa/munaxa-work/blob/da84612/.github/workflows/publish-images-ecr.yml), [`publish-images.yml`](https://github.com/munaxa/munaxa-work/blob/da84612/.github/workflows/publish-images.yml) |
| Platform (Work parts) | `infra/aws/stack/services.tf` (`module.work_api`, `module.work_admin`, `node_health`), `data.tf` (secret keys), `ops.tf` (`module.migrate`, db-admin), `scripts/db-bootstrap.sh`, `envs/nonprod.tfvars`, `modules/service` |
| Control (contract) | `prisma/schema.prisma` (`TenantLink.tenantRef`), `apps/api/src/control-plane.e2e.spec.ts` (entitlements path) |
| Identity (contract) | `apps/api/src/auth/auth.service.ts` (`perms` on login and refresh), `auth.controller.ts` (`GET /api/auth/login`), `artifacts/work-permissions.json` |

## 4. Work completed

| PR | What | Branch / head SHA | Merge SHA | Status |
|---|---|---|---|---|
| [#26](https://github.com/munaxa/munaxa-work/pull/26) | Runbook for creating the first tenant on a fresh AWS database: a command override in the `work-migrate` task, then link the tenant in Control and grant `work:*` in Identity | `claude/project-thread-zjaxqt` / `40da4e6` | [`19c7d0b`](https://github.com/munaxa/munaxa-work/commit/19c7d0b557a2e3a1f094680be55da172ca19a210) | Merged 2026-10-30 10:55 UTC |
| [#27](https://github.com/munaxa/munaxa-work/pull/27) | Pin all 6 `uses:` in `publish-images-ecr.yml` by commit SHA (reviewer R-07) | `claude/project-thread-zjaxqt` / `f33da25` | [`da84612`](https://github.com/munaxa/munaxa-work/commit/da84612ed0187e9e08d9df1971f75111f8270073) | Merged 2026-10-30 13:59 UTC |

Baseline PRs from earlier sessions, already on main [V]:

- [#25](https://github.com/munaxa/munaxa-work/pull/25), merged as `5f2cde9`: the migrate target, runtime grants and the ECR workflow.
- [#24](https://github.com/munaxa/munaxa-work/pull/24), merged as `2abb3c6`: production refuses `LICENSING_MODE=NONE`.

The SHA pins in #27 are the commit each tag resolved to via `git ls-remote` on 30 Oct [V]:

| Action | Pinned commit |
|---|---|
| actions/checkout v6.1.0 | `d23441a` |
| docker/setup-buildx-action v3.12.0 | `8d2750c` |
| aws-actions/configure-aws-credentials v6.3.0 | `e125382` |
| aws-actions/amazon-ecr-login v2.1.7 | `03f1aad` |
| docker/build-push-action v6.19.2 | `10e90e3` |

The checkout and configure-aws-credentials SHAs are the same ones munaxa-platform uses.

## 5. Work still in progress

None in this repository. The open items in §10 belong to other owners or need owner approval.

## 6. CI and test results (evidence)

| Run | Commit | Jobs | Result |
|---|---|---|---|
| [CI 41065851607](https://github.com/munaxa/munaxa-work/actions/runs/41065851607) | #27 head `f33da25` | Product isolation, Standards · Architecture · Localization, Mobile, Lint · Typecheck · Test · Build | **all 4 success** (13:45–13:59 UTC) [V] |
| [CI 41001578070](https://github.com/munaxa/munaxa-work/actions/runs/41001578070) | #25 head `36de887` | CI workflow | **success** [V] |
| none | #26 head `40da4e6` | `ci.yml` has `paths-ignore: '**/*.md'` | **no CI ran.** The change was docs only, and GitHub reported `mergeable_state: clean` [V] |

Notes on CI:

- CI runs on `pull_request` only. Nothing runs on a push to `main` [V].
- No publish workflow has run for ECR. ECR publishing is inert until `AWS_IMAGE_PUBLISHER_ROLE_ARN` is set [V].

**Local reproduction on PostgreSQL 16, 30 Oct 2026** [V]:

1. **Roles and database.** I ran munaxa-platform `infra/aws/stack/scripts/db-bootstrap.sh` unchanged except for
   `PGSSLMODE=disable`, with throwaway local credentials. It printed `db-bootstrap: work: database work, roles work_owner and work_app are in place.`
2. **Migrations and grants.** As `work_owner`, all 34 migration files applied in order with `ON_ERROR_STOP`, which emulates
   `prisma migrate deploy`. `deploy/aws/runtime-grants.sql` then exited 0. It prints about 200
   `WARNING: no privileges were granted` lines, for the `btree_gist` functions and `app_memberships_of`. These are harmless,
   because PUBLIC already holds EXECUTE.
3. **No bypass.** As `work_app`, `select * from app_isolation_diagnostics()` returned `work_app|f|f|f`: not a superuser, no RLS bypass,
   no tenant set.
4. **First tenant.** `NODE_ENV=production node bootstrap-tenant.mjs --platform-user-id test-user-1 --allow-production`
   as `work_owner` printed `Bootstrapped tenant 01a18c72-787f-7e8e-…`.
5. **Isolation holds.** As `work_app`, `app_memberships_of('test-user-1')` returned that tenant, and
   `select count(*) from tenant_membership` returned **0** with no tenant in context.

**Not re-run here:**

- [A] The Docker image builds. They need the GitHub Packages token.
- [A] #25 (29 Oct) recorded that both targets build, the migrate image applies all migrations idempotently, and the runtime image boots
  read-only with no capabilities, logging "connected as work_app, which cannot bypass row-level security".
- [A] I did not run the Work unit test suite locally. The evidence for it is the CI runs above.

## 7. Infrastructure dependencies

All of these exist in platform `main` `c4a1ad0` as code. None are applied [V].

- ECR repositories `munaxa-work/api`, `munaxa-work/migrate` and `munaxa-work/admin`, plus the image-publisher OIDC role (gate G2).
- ECS services:

  | Service | CPU / memory | Port | Health | Root filesystem |
  |---|---|---|---|---|
  | `work-api` | 256 / 512 | 3000 | container `/health/live`, ALB `/health/ready` | read-only |
  | `work-admin` | 256 / 512 | 3001 | ALB `/` | writable (Next.js cache) |

- The run-only task `work-migrate`, and the shared `db-admin` task.
- Database `work` on the shared RDS instance, with roles `work_owner` (LOGIN, CREATEROLE, NOBYPASSRLS) and `work_app` (NOBYPASSRLS).
  Work's migrations create `work_membership_resolver`, which is NOLOGIN.
- Secrets Manager bundles `<env>/work-api` and `<env>/work-migrate`.
- ALB rules on `work.test.munaxa.com`:
  - 50: `/api/auth/*` → Identity
  - 51: `/api/v1/*` → work-api
  - 52: everything else → work-admin
- Cloud Map name `work-api.<env>.munaxa.internal`, with a security group rule from admin to the API on port 3000.
- Upstream services: Identity (issuer, public keys, `perms`) and Control (entitlements on the `work` product, with a `tenantRef` that matches Work's tenant id).
- **Not needed:** S3, because `storageUnavailable` is the only storage port, by design [V]. Also not needed: Redis
  (`REDIS_URL` is optional), SES/SMTP, and a KMS key of Work's own.

## 8. Required environment variables (names only)

| Where | Names |
|---|---|
| work-api, plain env (set by the stack) | `NODE_ENV`, `PLATFORM_AUTH_ISSUER`, `PLATFORM_AUTH_AUDIENCE`, `PLATFORM_AUTH_ALGORITHM`, `PLATFORM_AUTH_PUBLIC_KEYS`, `LICENSING_MODE`, `CONTROL_PLANE_URL` |
| work-api, secrets (`<env>/work-api`) | `DATABASE_URL` (as `work_app`), `PII_MATCH_SECRET` (at least 32 characters; the development default is refused in production), `CONTROL_PLANE_TOKEN` (`mxc_…`, at least 20 characters, issued in the Control operator portal) |
| work-api, optional with defaults | `PORT`, `HOST`, `API_PREFIX`, `APP_NAME`, `APP_VERSION`, `BUILD_SHA`, `DATABASE_POOL_SIZE`, `LOG_LEVEL`, `LOG_PRETTY`, `OPENAPI_ENABLED`, `PLATFORM_AUTH_CLOCK_SKEW_MS`, `REDIS_URL`, `DEFAULT_LOCALE`, `DEFAULT_CALENDAR`, `DEFAULT_TIME_ZONE`, `DEFAULT_NUMERALS`, `INVITATION_VALIDITY_DAYS`, `DEFAULT_PORTALS` |
| work-api, unused on AWS (`LICENSE_FILE` mode) | `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_ALGORITHM`, `LICENSE_INSTALLATION_ID`, `LICENSE_REVOCATION_PATH` |
| work-migrate | env `NODE_ENV`; secret `DATABASE_MIGRATION_URL` (as `work_owner`) |
| work-admin | `NODE_ENV`, `PORT`, `WORK_API_URL`, `PLATFORM_SIGN_IN_URL`. No secrets. |
| GitHub, munaxa-work | variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`; secret `PLATFORM_PACKAGES_TOKEN` (build only); environment `image-release` with a required reviewer |

## 9. Security findings

No critical or high findings.

| # | Severity | Finding | Evidence | Status |
|---|---|---|---|---|
| W1 | Medium (ops gap) | A fresh database has no tenant, so every authenticated request answers 401 "No tenant resolved". The runtime image cannot run `bootstrap-tenant.mjs`, because root `pg` is pruned. | `scripts/bootstrap-tenant.mjs:40`; `apps/api/Dockerfile` prune stage | **Fixed:** #26 runbook. Reproduced in §6 [V]. |
| W2 | Medium (R-07) | ECR publish jobs used tag-pinned third-party actions while holding AWS OIDC credentials. | `publish-images-ecr.yml` before `da84612` | **Fixed:** #27 [V] |
| W3 | Low | `publish-images.yml` (GHCR, for Render) and `publish-images-ecr.yml` both trigger on `image/**`. One ECR release tag therefore also publishes to GHCR. The GHCR job has no protected environment, no "is on main" check, and its actions are still tag-pinned. Publishing does not deploy anything: Render pins a digest. | `publish-images.yml:18-29` | Open. [R] Retire it with Render, or give it its own tag prefix. Owner: Work, once Render retirement is approved. |
| W4 | Low | `OPENAPI_ENABLED` defaults to `true`, so the task serves Swagger at `/api/docs`. The ALB does not route that path to the API, so it is not reachable on the public host. | `environment.ts`, `application.setup.ts:37-48`; platform `services.tf` rules 51/52 | Open. [R] Set `OPENAPI_ENABLED=false` in `module.work_api.environment`. Owner: Agent 1. The item is listed in BLOCKERS B4 and is still absent at `c4a1ad0` [V]. |
| W5 | Info | Identity tokens carry both audiences (`munaxa-work,munaxa-control`). Work checks `aud=munaxa-work`, so a token meant for Control is also accepted by Work. | platform `services.tf` (identity env) | Cross-product item R-06. Owner: Agent 3. |
| W6 | Info | Without `perms`, Work authorizes nothing. Work keeps only the claim names in its catalogue. Identity resolves `perms` on login and refresh. | Work `platform-grants.ts`; Identity `auth.service.ts:283-298` | Contract item. Owner: Agent 3 and the operator. |

[V] Isolation controls confirmed:

- every tenant table has FORCE ROW LEVEL SECURITY
- no deployed role has BYPASSRLS
- the API refuses to start as a role that can bypass RLS (`app_isolation_diagnostics`)
- `CONTROL_PLANE_URL` must be https in production, and the request sets `redirect: 'error'` with a 3 s timeout
- the images run as a non-root user
- the GitHub Packages token is a BuildKit secret, not a build argument

## 10. Cost implications

[A] I could not confirm Fargate prices live, because the AWS connector needed re-authentication. The figures come from the platform README's
rates: 7 tasks at 2 vCPU / 4 GB cost about US$0.11 an hour, and each public IPv4 address costs US$0.005 an hour.

- **Per Testing session hour:** about US$0.04. Work runs 2 tasks at 0.25 vCPU / 0.5 GB, about US$0.03 an hour, plus 2 IPv4 addresses at US$0.01 an hour.
- **Always-on (not the plan):** about US$28 a month.
- **Fixed cost of its own:** none. ECR storage for 3 images is a few cents, and the database, ALB and secrets are shared.

## 11. Blockers and owners

Nothing in Work's code blocks Testing. Work's first run depends on the following:

| # | Dependency | Owner |
|---|---|---|
| 1 | Platform applied, and `AWS_IMAGE_PUBLISHER_ROLE_ARN` set on munaxa-work (gate G2) | Tamer (approval), Agent 1 |
| 2 | Work images published with an `image/<sha>` tag and approval in `image-release`, then digests set by tfvars PR (G5) | Tamer |
| 3 | Values in `<env>/work-api` and `<env>/work-migrate`. Passwords must be alphanumeric, 32 to 128 characters, as `db-bootstrap.sh` requires. `CONTROL_PLANE_TOKEN` comes from Control. | Tamer |
| 4 | Identity running, with its public keys in `identity_public_keys`, and a role carrying `work:*` grants for the test user | Agent 3 / Tamer |
| 5 | Control running, with the Work tenant id linked as the `work` `tenantRef` and a subscription | Agent 2 / Tamer |

## 12. Recommended next actions

Every step below needs owner approval.

1. Apply the platform stack, then run the db-admin task.
2. Publish the Work images.
3. Run `work-migrate`.
4. Run the first-tenant override from `deploy/aws/README.md`.
5. Link the tenant in Control and grant `work:*` in Identity.
6. Start a Testing session.
7. Run the smoke test:
   - `GET /health/ready` returns 200
   - `/api/v1/...` without a token returns 401
   - after sign-in through `https://work.test.munaxa.com/api/auth/login`, an entitled read returns 200

[R] Also close W4 (one line in platform) and W3 (when Render is retired).

## 13. Not executed (explicit)

I did **not** do any of the following:

- run Terraform plan or apply
- create, change or delete any AWS resource (the only AWS call, a read-only Pricing query, failed on authentication)
- create or change any KMS key or secret
- publish, tag or push any image (no `image/*` tag was created)
- deploy anything
- run a migration against any remote database (the database work in §6 was local only)
- make any Cloudflare, Render or Supabase change, or touch the old Docs stack
- dispatch or re-run any workflow
- build the Docker images in this session

PRs #26 and #27 were merged under the standing rule: all required checks passed, there were no critical or high findings, and
neither merge triggers a deploy or a publish.
