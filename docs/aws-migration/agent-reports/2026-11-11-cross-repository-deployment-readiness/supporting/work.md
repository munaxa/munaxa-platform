# munaxa-work: deployment readiness audit (11 Nov 2026)

Auditor scope: `munaxa-work` (local clone), branch `claude/project-thread-8chfj0` at `b490b25` (== origin/main). Backend and frontend were both audited. All checks ran in a scratch copy (`<audit-scratch>/work-audit/work`) with `@munaxa/*` packed from munaxa-platform `0ae17f9`, because GitHub Packages answers 401 here. Postgres 16 ran on :55433 and Redis on :56383. Both are now stopped.

## 0. Repo facts

| Item | Value |
|---|---|
| Name | munaxa-work (`package.json` `"private": true`, `UNLICENSED`). Visibility cannot be determined from the code. |
| main SHA | `b490b25`. Remote tag `image/b490b25792c4d35e5b489790508b2ae6489080cc` exists, which triggers `publish-images-ecr.yml`. |
| Workspace | pnpm 10.33 and turbo. The workspace has apps/api (NestJS 11), apps/admin (Next 15), apps/employee-portal, apps/manager-portal, apps/mobile (Flutter, not a workspace member), 7 packages and 18 `packages/modules/*`. |
| Published artefacts | No npm packages are published. Images `munaxa-work/{api,migrate,admin}` go to ECR on an `image/<sha>` tag. GHCR `munaxa-work-{api,admin}` publishes only on manual dispatch. |
| Platform deps (lockfile) | `@munaxa/auth 2.4.1`, `crypto 2.4.1`, `licensing 0.2.0`, `platform 1.6.1` (the source is now 1.7.0), `ui/theme 1.1.1`, `types/interfaces 2.4.1` |

Recent merges relevant to deployment, from `git log`:
- `b490b25` (#29): GHCR publish runs on dispatch only, and paths-ignore was removed from CI.
- `f812dfe` (#28): `246edc5` trusts the RDS roots (`deploy/aws/rds-ca-eu-central-1.crt`, `NODE_EXTRA_CA_CERTS`).
- `da84612` (#27): the ECR workflow actions are pinned by SHA.
- `19c7d0b` (#26): first-tenant bootstrap documented for AWS.
- `5f2cde9` and `2abb3c6` (#25, #24, `fad8121`): migrate image target, `runtime-grants.sql`, ECR publishing.
- `36ea7ba` (#23): signed revocation lists applied to the offline licence. `78005e8` refuses `LICENSING_MODE=NONE` in production.
- `ca54134`, `54b245f` (#21, #22): dependency remediation.
- `869cceb` (#20): staging readiness audit.

CI workflows:
- **`ci.yml`** runs on `pull_request: branches: [main]` **only** (ci.yml:3-6 at b490b25). Its jobs:
  - `standards`: check-standards, architecture, localization, dependencies, platform parity. No install needed.
  - `node`: install with `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN`, parity, format, lint, typecheck, `db:migrate` on a postgres:17 service, test, build, check:production-output, prisma validate, `pnpm audit --audit-level high`.
  - `mobile`: flutter analyze, test, debug APK.
  - `boundaries`: a cross-product import grep.
- **Why main shows only a publish run:** ci.yml has no `push` trigger, so CI never runs on main itself. The only workflows that can start on a main commit are tag-triggered or dispatched. Before #29, `publish-images.yml` (GHCR) listened on `image/**` tags. Now `publish-images-ecr.yml` does, and the `image/b490b25…` tag would have started it. Fixed locally (WK-07).
- **`publish-images-ecr.yml`** runs on tag `image/<40-hex>`. It verifies the commit is on main, uses the `image-release` environment, OIDC role `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` (it fails if unset), BuildKit secret `npm_token=PLATFORM_PACKAGES_TOKEN`, and checks for non-root and no token in the image. **It does not require a green CI run for the commit** (WK-14).
- **`publish-images.yml`** (GHCR) runs on `workflow_dispatch` only.

## Findings

| ID | Sev | repo:path:line | Evidence | Impact | Remediation | Blocks | Status |
|---|---|---|---|---|---|---|---|
| WK-01 | High | munaxa-work:apps/api/src/identity/platform-token-authentication.ts:47-62,96-112; apps/api/src/tenancy/tenant.middleware.ts:60-99 | `VerifiedAccessToken` declares only `sub, iss, iat, perms`, and `tid` is deliberately discarded. The tenant comes from the `x-munaxa-tenant` header over stored memberships. Identity resolves `perms` **per Identity tenant** (munaxa-identity apps/api/src/auth/auth.service.ts:390-396 `resolver.resolve(tenantId, userId)`). **Proved live:** one token (Identity tid `idt_tenantA`, perms `work:organization:tenant-settings:read`) returned 200 in Work tenant A **and** in Work tenant B by changing only the header. | A user who holds permissions in one tenant gets the same permissions in every Work tenant where they are a member. For example, payroll admin in A becomes payroll admin in B, where they are an ordinary employee. Multi-membership is a supported case (`resolveTenant` handles "ambiguous"). | Bind grants to a tenant. Options: (a) Work maps its tenant to the Identity `tid` and refuses a mismatch; (b) Identity issues per-Work-tenant perms; (c) restrict to one membership per principal until fixed. Needs an ADR across Identity and Work. | prod (nonprod is acceptable if every user has a single membership) | open |
| WK-02 | High | munaxa-work:apps/api/src/identity/platform-token-authentication.ts:148; munaxa-platform:packages/platform/auth/src/tokens.ts:136-192 | Work calls `this.verifier.verifyAccessToken(token)` with no `tokenVersion`. `grep -rn "amr\|mfa\|tokenVersion\|sid\|jwks"` over apps and packages finds nothing. Platform checks `ver` only when the caller passes `options.tokenVersion` (tokens.ts:187). The default TTL is `15 * 60 * 1_000` (tokens.ts). | **Confirmed: a signed-out, revoked, password-reset or version-bumped token is accepted for up to 15 min plus 30 s skew.** There is no MFA or `amr` enforcement for sensitive modules (payroll, compensation, relations). ADR-0076 wrongly said the bump is enforced; corrected locally (WK-08). | Add a revocation check: an Identity introspection or `sid`/`ver` denylist with a short cache, or cut the access TTL for Work. Decide whether payroll and compensation writes require `mfa=true`. | prod | open (doc corrected) |
| WK-03 | Medium | munaxa-work:packages/config/src/platform-authentication.ts:298-303,377-403 | Verification keys come only as static PEMs in `PLATFORM_AUTH_PUBLIC_KEYS`. There is no JWKS URL and no refresh. | Rotating Identity's signing key needs a redeploy of Work with both keys, coordinated with Identity. A missed rotation means 401 for everyone. | Document the rotation runbook (old and new key overlap). Optionally add JWKS fetch with pinning. | neither (operational) | open |
| WK-04 | Medium | munaxa-work:packages/modules/organization/src/infrastructure/stored-tenant-settings.ts:44-51 (b490b25) | `this.pool.query('select … from tenant_settings where tenant_id = $1 …')` ran on a bare pooled connection with no `app.tenant_id`. `tenant_settings` has a forced `tenant_isolation` policy. Probe as a NOBYPASSRLS role: `no-tenant-context` returned 0 rows and `with-tenant-context` returned 1. The new test failed on the old code (`expected 'UTC' to be 'Asia/Riyadh'`). The old tests used `fixture.admin` (superuser). | In a real deployment (`work_app`), every tenant's language, calendar, time zone, invitation validity and default portals silently fell back to the deployment env defaults. | Read inside a read-only transaction with transaction-local `set_config('app.tenant_id', tenantId, true)`. Add a test as the application role. | nonprod (functional) | **fixed-in-local-commit e9ffea4** |
| WK-05 | Medium | munaxa-work:apps/admin/src/shell/platform-session.ts:30-64; apps/admin/src (whole) | The admin reads `__Host-mx_session` (the access token) and forwards it as `Bearer`. It has **no refresh flow**, no writer for `munaxa_work_tenant`, no tenant picker, and **no forms, no client-side mutations and no write calls**: `grep onClick\|<input\|<button\|<Button` in non-test tsx returns 0. `__Host-` requires Identity and admin on one origin (deploy/aws/README.md:11 routes `/api/auth/*` to Identity on `work.munaxa.com`). | (a) About 15 min after sign-in every page shows "signed out" until the browser hits Identity's refresh, and nothing in the admin triggers it. (b) A user with two memberships gets 401 "No tenant resolved" with no way to choose. (c) Nothing can be created or changed from the UI. All 513 routes are reachable only by direct API calls. | Add a refresh redirect or a silent refresh, a tenant picker that sets the selection cookie, and write UIs. These are product work. | prod (nonprod only for read-only demo use) | open |
| WK-06 | Medium | munaxa-work:apps/api/src/health/health.controller.ts:88 | `cache: this.environment.REDIS_URL === undefined ? 'not-configured' : 'up'`. Live: with `REDIS_URL=redis://127.0.0.1:1` (nothing listening), `/health` reported `"cache":"up"`. No code connects to Redis anywhere (`grep -rn redis` finds only this line and the schema). | The health response misreports a dependency. Redis is provisioned or expected (docker-compose, .env.example) but unused. | Report `not-used` or drop it until a Redis adapter exists. Do not provision ElastiCache for Work. | neither | open |
| WK-07 | Medium | munaxa-work:.github/workflows/ci.yml:3-6 | `on: pull_request: branches: [main]` only. | No CI run exists for any main commit, so there is no record that the commit an `image/<sha>` tag names passed CI after merge. This is why main shows only publish runs. | Add `push: branches: [main]` and keep main runs uncancelled. | neither | **fixed-in-local-commit 21ff9a6** |
| WK-08 | Low | munaxa-work:docs/adr/0076-cross-product-authorization-contract.md:93-95 | "Immediate revocation is Platform's `tokenVersion` bump, which `verifyAccessToken` enforces." Work never passes a version (WK-02). | The docs overstate the revocation guarantee. | Correct the text. | neither | **fixed-in-local-commit b6c48e5** |
| WK-09 | Low | munaxa-work:.env.example | Missing names read by the code: `DEFAULT_NUMERALS`, `INVITATION_VALIDITY_DAYS`, `DEFAULT_PORTALS` (environment.ts:51-72), `WORK_API_URL`, `PLATFORM_SIGN_IN_URL` (portal-environment.ts), `DATABASE_MIGRATION_URL` (apps/api/Dockerfile migrate CMD), `TEST_DATABASE_URL`. `turbo.json` globalEnv lists `NEXT_PUBLIC_POSTHOG_KEY` and `SENTRY_DSN`, which nothing reads. | The env contract is incomplete for operators. | Add the missing names. The dead turbo env names are left as-is (harmless). | neither | **fixed-in-local-commit 62615f4** |
| WK-10 | Low | munaxa-work:README.md:6, ARCHITECTURE.md:143 | "186 tables, 32 migrations". Actual: 34 migration dirs and 187 tables (188 in `public` minus `_prisma_migrations`), all 187 with RLS enabled and forced. | Doc drift. | Correct the counts. | neither | **fixed-in-local-commit b6c48e5** |
| WK-11 | Low | munaxa-work:packages/config/src/environment.ts:88 | `OPENAPI_ENABLED: booleanFromEnvironment(true)`. Live: `/api/docs` returned 200 (Swagger UI) with defaults. `/health` publicly returns version and build. | The full API surface (513 routes) is published unauthenticated in production unless the operator sets it to false. | Set `OPENAPI_ENABLED=false` in the stack tfvars, or default it to false when `NODE_ENV=production`. | neither | open |
| WK-12 | Low | munaxa-work:prisma/schema.prisma vs prisma/migrations | `prisma migrate diff --from-migrations … --to-schema-datamodel …` exits 2 with 184 tables changed: 255 FKs, 17 indexes and 128 column defaults differ. The runtime never uses `@prisma/client` (no `PrismaClient` import outside tests). The schema serves only `validate` and the architecture check. | `prisma migrate dev` or `db push` would generate destructive SQL, and nothing documents that it must never be used. | Document migrations as SQL-authoritative, or add a drift gate. | neither | open |
| WK-13 | Low | munaxa-work:apps/api/src/** | No helmet or security headers, no rate limiting, no CORS config. The admin calls the API over `http://work-api.<env>.munaxa.internal:3000` (deploy/aws/README.md:12), so bearer tokens cross the VPC in cleartext. | Defence-in-depth gaps. Acceptable behind an ALB or WAF. | Use WAF rate rules at the ALB. Consider TLS or a service mesh internally. | neither | open |
| WK-14 | Low | munaxa-work:.github/workflows/publish-images-ecr.yml:51-77 | The source job checks only that the tag SHA is on main. It never checks commit status. | An image can be published for a main commit whose CI failed or never ran. | After WK-07, require a successful `CI` run for the SHA (`gh api …/commits/$SHA/check-runs`) before publishing. | neither | open |
| WK-15 | Low | munaxa-work:apps/api/Dockerfile:179-180 | HEALTHCHECK hard-codes `127.0.0.1:3000`, while `PORT` is configurable. | Changing `PORT` makes the image report unhealthy. ECS uses its own health check, so this is minor. | Read `PORT` in the healthcheck. | neither | open |
| WK-16 | Info | munaxa-platform:packages/platform/auth/src/tokens.ts:169,181-182 | `claims.exp * 1_000 + skew < now`: if `exp` is missing this is NaN and never expires. `actual.includes(entry)` on a string `aud` is a substring match. Identity always mints `exp` and an array `aud`. | A latent library weakness, which needs a validly signed token to exploit. | Report to the Platform owner: require a numeric `exp` and normalise `aud`. | neither | open (not this repo) |

## What is genuinely complete / partial / missing

The backend for all 18 modules is wired into `AppModule` (apps/api/src/app.module.ts:120-143), with **513 routes** counted by `@Get/@Post/@Put/@Patch/@Delete` in `packages/modules/*/src/api`. The admin is **read-only** for every module.

| Module | API routes (writes) | Admin UI | Classification |
|---|---|---|---|
| identity (workforce users, invitations, memberships, delegation) | 18 (14) | none | Backend complete. No UI. Tenant creation only via `scripts/bootstrap-tenant.mjs`. Partial. |
| organization | 38 (26) | read-only page | Partial (no write UI). Tenant settings were broken under RLS until fixed (WK-04). |
| people | 30 (25) | read-only | Partial |
| employment | 18 (11) | read-only list and employee record | Partial |
| recruitment | 42 (30) | read-only workspace | Partial |
| onboarding | 25 (17) | read-only | Partial |
| attendance | 34 (21) | read-only register and day | Partial |
| leave | 32 (17) | read-only register, request and balance | Partial |
| compensation | 36 (18) | read-only | Partial |
| payroll | 28 (11) | read-only runs, results and payslip | Partial |
| documents | 13 (8) | read-only | Partial. **No `StoragePort` adapter exists, so no file bytes can be uploaded or downloaded.** Missing storage. |
| letters | 16 (9) | read-only | Partial |
| relations | 19 (9) | **none** | Backend only. No UI. |
| assets | 14 (7) | read-only | Partial |
| performance | 49 (36) | read-only | Partial |
| career | 40 (27) | read-only | Partial |
| learning | 38 (27) | read-only | Partial |
| workflow and approvals | 23 (13) | read-only queue and detail (no approve/reject controls) | Partial. **No `JobPort` adapter, so reminders and escalations never fire on a timer.** |
| licensing (cross-cutting) | guard and gate | n/a | Complete for `CONTROL_PLANE` and `LICENSE_FILE` |
| notifications | n/a | n/a | **Missing.** Only `RecordingNotificationPort` exists (kernel in-process-ports.ts:64). Nothing is delivered (no email or SMTP adapter). |
| background jobs, queues, cron | n/a | n/a | **Missing.** None exist (`grep JobPort` shows only comments saying none). |
| Redis | n/a | n/a | **Unused** (WK-06) |
| employee-portal, manager-portal | n/a | bootstrap page with a dead button | **Missing.** No Dockerfile, not published. |
| mobile | n/a | 51-line bootstrap | **Missing** |

**No backend module is production-ready as a product.** Every module lacks write UI, storage and notifications are absent, and WK-01 and WK-02 sit under all of them.

## Identity integration (verified)

- **How tokens arrive.** The browser holds the `__Host-mx_session` cookie, which Identity sets with the access token on the shared origin. The admin's server components read it and send `Authorization: Bearer`. The API accepts only an Authorization header (no cookie), so there is no CSRF surface.
- **Verification.** `TokenService` from `@munaxa/auth` with `AsymmetricSigner(alg, publicKeys)`. Settings: issuer must equal `PLATFORM_AUTH_ISSUER`, audience must overlap the comma list `PLATFORM_AUTH_AUDIENCE`, algorithm is `RS256|ES256` only (the signer's own, not the header's), `kid` selects the key, skew is `PLATFORM_AUTH_CLOCK_SKEW_MS` (default 30000). There is no JWKS.
- **Claims used.** `sub` (becomes platformUserId), `iss`, `iat`, `perms` (only `work:` grants in the 285-name catalogue; wildcards are dropped and logged). Ignored: `tid`, `sid`, `ver`, `amr`, `mfa`, `roles`, `scope`.
- **Live checks:**
  - no token: 401
  - tampered signature: 401
  - wrong `aud`: 401
  - wildcard-only perms: 403, with a "dropped" warning in the log
  - two memberships and no header: 401 "No tenant resolved"
  - foreign tenant header: 401
  - the same token in a second tenant: 200 (WK-01)
  - no token in logs (0 matches for `eyJ` or `authorization`)
- **Authorization.** `PlatformPermissionChecker`: set membership of the request's grants (AsyncLocalStorage) inside a resolved tenant context. System context gets nothing.
- **No auth configured.** Startup picks `UnauthenticatedPort` and answers 401 everywhere. This is allowed in production; it fails closed.

## Tenant isolation (verified)

- **RLS.** 187/187 tables have RLS enabled and forced.
- **Policies:**
  - `tenant_isolation`: `tenant_id = app_current_tenant()`, which reads `current_setting('app.tenant_id', true)`.
  - `workforce_user.tenant_reachability`: reachable via a membership, `WITH CHECK true`.
  - `membership_resolution` SELECT for `work_membership_resolver` only.
- **Security-definer functions.** Exactly one, `app_memberships_of`, owned by the nologin `work_membership_resolver`.
- **Per-request tenant.** `PostgresUnitOfWork` runs `begin; select set_config('app.tenant_id',$tenant,true)` on each transaction (postgres-unit-of-work.ts:41-44). The tenant comes from membership resolution, never from the token.
- **Startup refusal.** `assertIsolationEnforced` refuses superuser or BYPASSRLS roles. Verified live: "Refusing to start: the database role "work" can bypass row-level security…", exit 1.
- **Raw pool queries outside the unit of work.** `membership-directory.ts:41` (uses the definer function, by design), `stored-tenant-settings.ts` (WK-04, fixed), and the isolation and health checks. No other runtime raw query bypasses the unit of work.
- **AWS-like run.** As `work_owner` (NOSUPERUSER NOBYPASSRLS, ADMIN on the resolver role): all 34 migrations applied, re-run idempotent ("No pending migrations"), `runtime-grants.sql` ran, and the API connected as `work_app` with "Tenant isolation enforced".

## Licensing

- **Default.** `LICENSING_MODE=NONE` (environment.ts:115). It is refused in production even when unset. Verified: `LICENSING_MODE: production needs LICENSE_FILE or CONTROL_PLANE`.
- **CONTROL_PLANE.** Per-tenant `GET <url>/…entitlements` with a Bearer token, 3 s timeout, `redirect: 'error'`, 60 s cache, last-good snapshot kept in `licensing_state`.
- **Control unreachable, no snapshot.** Verified live: every request returns **402** "no valid Munaxa Work subscription" while `/health/ready` stays 200.
- **Control unreachable, with a snapshot.** `SAAS_AVAILABILITY_POLICY`: full access for 1 h, no growth until 24 h, read-only until 7 d, then none.
- **Usage reporting.** An hourly headcount POST, fire-and-forget.
- **LICENSE_FILE.** Offline verification and a signed revocation list.

## Env var NAMES

| Group | Names |
|---|---|
| API, required | `DATABASE_URL` |
| API, required in production | `NODE_ENV=production`, `PII_MATCH_SECRET` (≥32 chars, not the dev default), `LICENSING_MODE` (`CONTROL_PLANE` or `LICENSE_FILE`) |
| CONTROL_PLANE mode | `CONTROL_PLANE_URL` (https in production), `CONTROL_PLANE_TOKEN` |
| LICENSE_FILE mode | `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_INSTALLATION_ID`, optional `LICENSE_ALGORITHM`, `LICENSE_REVOCATION_PATH` |
| Auth (all four or none) | `PLATFORM_AUTH_ISSUER`, `PLATFORM_AUTH_AUDIENCE`, `PLATFORM_AUTH_ALGORITHM`, `PLATFORM_AUTH_PUBLIC_KEYS`, optional `PLATFORM_AUTH_CLOCK_SKEW_MS` |
| API, optional with defaults | `APP_NAME`, `APP_VERSION`, `BUILD_SHA`, `HOST`, `PORT`, `API_PREFIX`, `DATABASE_POOL_SIZE`, `REDIS_URL` (unused), `LOG_LEVEL`, `LOG_PRETTY`, `DEFAULT_LOCALE`, `DEFAULT_CALENDAR`, `DEFAULT_TIME_ZONE`, `DEFAULT_NUMERALS`, `INVITATION_VALIDITY_DAYS`, `DEFAULT_PORTALS`, `OPENAPI_ENABLED`, `NODE_EXTRA_CA_CERTS` (set in the image) |
| Migrate image | `DATABASE_MIGRATION_URL` |
| Admin | `WORK_API_URL` (defaults to `http://127.0.0.1:3000`), `PLATFORM_SIGN_IN_URL` |
| Tests and scripts | `TEST_DATABASE_URL`, `CI` |

## Secret NAMES

| Where | Names |
|---|---|
| Runtime | `DATABASE_URL` (work_app credentials), `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN` |
| Migrate | `DATABASE_MIGRATION_URL` (work_owner credentials) |
| CI and GitHub | `PLATFORM_PACKAGES_TOKEN` (read:packages; build secret `npm_token`), `GITHUB_TOKEN` (fallback), repo var `AWS_IMAGE_PUBLISHER_ROLE_ARN` (not a secret), environment `image-release` |
| Not secrets | `PLATFORM_AUTH_PUBLIC_KEYS`, `LICENSE_PUBLIC_KEYS` (public material) |

## Startup dependencies, health and failure behaviour

- **Startup.**
  - The environment is validated at import. An invalid config throws `ConfigurationError`, prints only the names and the reason, and exits 1.
  - The pg pool is created lazily.
  - `onModuleInit` runs the isolation assertion. A superuser or BYPASSRLS role, a missing migration, or an unreachable DB fails startup with exit 1.
  - Redis is not contacted. Control is not contacted at startup.
- **Liveness.** `/health/live` returns `{status:ok}` and makes no checks.
- **Readiness.** `/health/ready` runs `select 1` with a 2 s timeout and returns 503 on failure. It is unprefixed and is what the image HEALTHCHECK uses.
- **`/health`.** Version and build, `database` up or down, and `cache` "up" whenever the variable is set (WK-06).
- **DB down at runtime.** Readiness 503. Business requests 500, as problem+json with a generic detail.
- **Control down.** 402 for tenants with no snapshot. Degraded per the availability policy for tenants with one. Readiness unaffected.
- **Identity down.** No runtime call is made, because keys are static. New sign-ins fail upstream, and existing tokens keep working until they expire.
- **Logging.** pino JSON with redaction of `authorization`, `cookie`, `x-api-key`, `set-cookie` and body `password/token/secret`. The `req` serializer emits only id, method and url. An unexpected error's detail stays in the log and the client gets "An unexpected error occurred."

## Commands run and results

| Command | Result |
|---|---|
| `node scripts/check-{standards,architecture,localization,dependencies,platform-parity}.mjs` (original repo, before and after fixes) | all exit 0. 187 models; 2073 files with no cycles; 20 catalogue sets. |
| `prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}"` (original repo, after fixes) | pass. Scratch `pnpm format:check` failed only on the overridden `package.json`, an artefact of the scratch setup. |
| `pnpm lint` | pass, 51/51 tasks |
| `pnpm typecheck` | pass, 51/51 tasks |
| `pnpm build` | pass, 29/29 tasks (api, admin 30 dynamic routes, both portals static) |
| `pnpm check:production-output` | pass: 1159 reachable modules, no test-only code |
| `pnpm test` (TEST_DATABASE_URL on PG16, migrated) | pass: **51/51 tasks, 5675 tests, 0 failed**. api 1025, admin 769, workflow 902, relations 429, career 294, learning 235, identity 234, assets 224 and others. |
| `pnpm prisma:validate` | valid |
| `pnpm prisma:generate` | generated Prisma Client 6.19.3 |
| `pnpm db:migrate` (superuser) and `prisma migrate deploy` (as non-superuser `work_owner`), then `runtime-grants.sql`, then re-run | 34 migrations applied. Idempotent. Grants applied. |
| `prisma migrate diff --from-migrations … --to-schema-datamodel …` | exit 2: drift (WK-12) |
| `pnpm audit --audit-level high` | 0 high or critical. 1 low (deepmerge), 2 moderate (glob, minimatch). `@munaxa/*` tarballs are local. |
| API startup scenarios (built `dist/main.js`) | production with licensing unset: refused. Default PII secret plus http Control: refused. Superuser DB: refused. `work_app`: started, with live/ready/health 200 and `/api/docs` 200. |
| End-to-end token probes (ES256 key, `@munaxa/auth` TokenService) | see Identity section. WK-01 reproduced. |
| WK-04 red/green | new test failed on b490b25 code (`'UTC'` vs `'Asia/Riyadh'`) and passes with the fix (15/15). Org package tsc and eslint clean. `bootstrap-tenant.integration` 18/18. |
| `docker info` | no daemon, so images were not built locally |
| `flutter` | not installed, so mobile was not run |

## Local commits (branch `claude/project-thread-8chfj0`, not pushed)

| SHA | Subject | Tests |
|---|---|---|
| `e9ffea4` | Read tenant settings with the tenant set, so RLS does not hide them | organization-persistence.integration 15/15 (new test red before, green after); tsc; eslint; standards |
| `62615f4` | Complete .env.example with every variable the code reads | n/a (no test reads it) |
| `21ff9a6` | ci: also run CI on pushes to main | YAML parse; prettier |
| `b6c48e5` | docs: correct migration and table counts, and the tokenVersion claim in ADR-0076 | prettier |

## Proposed decision

**READY FOR NON-PRODUCTION**, with conditions:
- Every test user has exactly one membership (WK-01).
- The team accepts a read-only admin and the 15-minute window for revoked tokens.
- `e9ffea4` is merged so tenant settings take effect.

The evidence for this:
- Every gate is green: 5675 tests, lint, typecheck, build and the production-output check.
- Migrations apply cleanly and idempotently as a non-superuser owner.
- RLS is forced on all 187 tables, and startup refuses a bypassing role.
- Config validation fails closed.
- Token verification is sound for signature, issuer, audience and algorithm.

**NOT READY FOR PRODUCTION**, for these reasons:
- Cross-tenant permission carry-over (WK-01).
- Revoked or signed-out tokens accepted for about 15 minutes, with no MFA enforcement (WK-02).
- No write UI, no admin refresh and no tenant picker (WK-05).
- No file storage, notifications or scheduler, so documents hold no bytes, nothing is delivered, and workflow reminders and escalations never fire.
- Employee and manager portals and mobile are placeholders.
