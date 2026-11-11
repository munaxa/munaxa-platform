# Audit: munaxa-control and munaxa-school, focused on licensing (11 Nov 2026)

Auditor scope: munaxa-control (`munaxa-control` (local clone), main a24c568) and munaxa-school
(`munaxa-school` (local clone), main 9671bcb). I read the shared contract `@munaxa/licensing` 0.2.0
(munaxa-platform 0ae17f9, `packages/platform/licensing`) without changing it, and grepped munaxa-work (b490b25) and
munaxa-docs (b8c7e25) without changing them. I made no AWS calls, dispatched no workflows and pushed nothing. Migrations ran only against
disposable local Postgres 16 clusters on ports 55435 and 55436. Local commits are on branch
`claude/project-thread-8chfj0` in both repositories and have not been pushed.

## 0. Repo facts

| | munaxa-control | munaxa-school |
|---|---|---|
| Visibility | Cannot be determined from code. `package.json` is `private: true`, `license: UNLICENSED` | Same |
| main SHA | a24c568 | 9671bcb |
| Published versions | None. These are apps; images go to ECR `munaxa-control/{api,migrate,portal}` | None. Images: GHCR `munaxa-api` and `munaxa-admin` (deploy.yml); ECR `munaxa-school/{api,migrate,admin}` (publish-images-ecr.yml) |
| Depends on | `@munaxa/licensing ^0.2.0`, `@munaxa/crypto ^2.4.1`, `@munaxa/auth ^2.4.1`, ui, platform, theme, icons | `@munaxa/licensing ^0.2.0`, `@munaxa/crypto ^2.4.1`, platform, ui, theme, tokens |

**Control PRs, all of them:**
- #1 the control plane
- #2 nonce-based CSP for the portal
- #3 signed revocation lists
- #4 KMS signing (ADR-0008) and ECR images
- #5 Cloudflare Access verification on the API and the portal
- #6 portal downloads carry the Access token; the migrate image runs pnpm offline
- #7 ADR-0008 accepted

**School PRs relevant to deployment:**
- #12 licensing through the shared contract
- #13 no production deploy without an approval
- #16 package token for private packages
- #17 signed revocation lists on premises
- #18 production refuses `DATABASE` licensing
- #19 AWS images and a migrate target; nothing deploys on a merge
- #21 S3 through the ECS task role; production never stubs uploads
- #22 ECR actions pinned by commit
- #23 the SSE header is no longer signed into presigned uploads
- #24 CI has no paths-ignore, so it can be a required check

**CI workflows:**
- **Control `ci.yml`**: runs on pull requests and on pushes to main. Steps: install, prisma generate, roles plus database on a postgres service, migrate, format, lint, typecheck, test, build, a catalogue drift check, `pnpm audit --audit-level high`, and a docker build of the api, migrate and portal targets.
- **Control `publish-images.yml`**: starts on a **tag push** `image/**`. It checks that the tag names a commit on main, then pushes to ECR through OIDC in the `image-release` environment.
- **School `ci.yml`**: runs on pull requests only. Steps: format, lint, typecheck, unit tests, e2e/RLS tests, build. Separate jobs run Flutter analyze and test, plus security scans: deploy-gate tests and lint, actionlint, a gate environment report, `pnpm audit`, and gitleaks.
- **School `deploy.yml`, `deploy-cloudflare.yml`, `seed-environment.yml` and `publish-images-ecr.yml`**: all are `workflow_dispatch` only, behind `production-gate`. See section 3.

## 1. Licensing: answers with evidence

### Modes

**Issuer (Control).**
- Online: SaaS deployments call `GET /api/v1/products/:product/tenants/:tenantRef/entitlements` with a service credential (`entitlements/products.controller.ts`). Control answers with an unsigned `EntitlementSnapshot`, or 404.
- Offline: `mxl1` licences signed with ES256 or RS256 (`licensing.service.ts` `issueIn`). Signed `mxr1` revocation lists. `mxa1` activation requests. Public keys are published at `GET /api/v1/licensing/public-keys`.
- Signing backends: `FILE` (a mounted PEM) or `KMS` (`licence-signer.ts`).

**Shared contract (`@munaxa/licensing` 0.2.0).**
- `issueLicense` and `verifyLicense` refuse symmetric algorithms (`license.ts` `assertAsymmetric`).
- Signing uses canonical JSON plus a domain prefix (`munaxa-license/v1\n`).
- `readEntitlementResponse`: 404 means NONE. Any other non-200, including 401 and 403, means UNAVAILABLE.
- `resolveSnapshot` sets the outage policy: full for 1 hour, no growth for 24 hours, read-only for 7 days, then export only (`availability.ts`).
- Tenant and product mismatch is checked in `accessModeOf` (`entitlements.ts:183`).

**School.** `LICENSING_MODE` is one of `DATABASE`, `LICENSE_FILE` or `CONTROL_PLANE` (`apps/api/src/config/env.validation.ts:64`).

**Work and Docs.** Both use `NONE`, `LICENSE_FILE` or `CONTROL_PLANE`, defaulting to `NONE`:
- Work: `munaxa-work/packages/config/src/environment.ts:115`.
- Docs: `munaxa-docs/apps/api/src/core/config/configuration.ts:615`.

### Default mode, and whether production can run permissively by accident

The default is permissive in all three products: School `DATABASE`, Work and Docs `NONE`. School's `DATABASE` mode grants everything to a tenant with no subscription row (`subscription.service.ts:120`: `if (!snap.subscription) return true; // permissive when un-subscribed`).

**Production refuses the permissive default, even when the variable is unset:**
- **School** `env.validation.ts:133`. I checked this by running it: `NODE_ENV=production` with no `LICENSING_MODE` gave `Invalid environment configuration: LICENSING_MODE: production needs LICENSE_FILE or CONTROL_PLANE…`. `CONTROL_PLANE_URL=http://…` was also refused with "must be https in production".
- **Work** `packages/config/src/licensing.ts:53-62`.
- **Docs** `configuration.ts:983`.

**Remaining gap:** a non-production `NODE_ENV`, such as `staging` or `development` on a reachable host, still runs permissively. `NODE_ENV` only accepts development, test or production, so staging must use `production`; `render.yaml` does.

### Whether Control is needed at runtime

- **`CONTROL_PLANE` mode (Munaxa-hosted):** Control is needed. School asks once per tenant per 60 seconds (`LicenceSource.TTL_MS`). It uses a 3-second timeout (`licence.source.ts:49`) and `redirect: 'error'` (:165, :286).
  - If Control is down, School keeps the last verified snapshot, which is persisted in `LicensingState`, and degrades it by age.
  - Boot and readiness do **not** depend on Control. I checked this by running it: the API booted against an unreachable `https://127.0.0.1:9`, `/api/v1/health/ready` answered 200, and an unauthenticated request answered 401.
- **`LICENSE_FILE` mode (on premises):** Control is not contacted at all. It is offline files only: the licence, an optional revocation list, and `LICENSE_PUBLIC_KEYS`.

### Whether verification fails safely

| Case | Result (School) | Evidence |
|---|---|---|
| Bad signature, unknown kid, wrong product, wrong installation, malformed file | `snapshot: null`, `cap: NONE`: core modules only, never the permissive default | `licence.source.ts:309` / `refused()` :395; spec "a missing, forged or foreign licence grants nothing" |
| Expired | The licence still verifies, but its effective status is EXPIRED, so the tenant is read-only. Ending a licence is not treated as a forgery | contract `verifyLicense` docs; spec "an ended licence is read-only" |
| Clock rolled back | `CLOCK_ROLLBACK`. The latest observed instant persists across restarts | spec "a clock wound back across a restart…" |
| Control down, or 401/403/5xx, or an answer about the wrong tenant | Treated as an outage. Degrades through full, no growth, read-only, nothing | spec "an outage degrades the last answer by age", "a refused credential … is an outage" |
| Control answers 404 | Treated as NONE: the cached snapshot is dropped and the tenant gets core modules only | spec "no subscription grants nothing…" |
| Revocation list forged, older, or deleted | Ignored; the persisted list stays in force. A persisted list that no longer verifies fails closed | specs at `licence.source.spec.ts:185-248` |

### Signing: ADR-0008 compared with the code

The code matches ADR-0008.
- `LICENCE_SIGNING_BACKEND` defaults to `FILE`, but production refuses an unset value (`environment.ts:74`, `:251`).
- With `KMS`: a key file is refused, the key ID must be an ARN, ES256 is the only algorithm, and the public key must be P-256.
- The two-pass build makes the second pass sign exactly the bytes captured in the first.
- KMS is called with `MessageType: DIGEST` and `ECDSA_SHA_256`. The DER signature is converted to P1363 and verified against the configured public key before it is returned.
- Startup runs `selfTest()` (`licensing.service.ts:90`). The sweep task also boots this module.
- Terraform (munaxa-platform `infra/aws/stack/services.tf:193-345`): an `ECC_NIST_P256`/`SIGN_VERIFY` key, a 30-day deletion window, `prevent_destroy`, and a task role limited to `kms:Sign` with the algorithm and digest-type conditions. The env vars are `LICENCE_SIGNING_BACKEND=KMS`, `LICENCE_SIGNING_KMS_KEY_ID`, `LICENCE_SIGNING_PUBLIC_KEY` and `LICENCE_SIGNING_KID` (from tfvars).
- **Drift:** `.env.example` and `environment.ts` still said "proposed". Fixed in a local commit (CT-06). Platform `variables.tf:293` and the `services.tf:187` comment still say "proposed"; that repo is outside my scope.

### Key ID and public key distribution

- Control publishes `{keys:[{kid, algorithm, publicKey, current}]}` publicly. The ALB forwards `/api/v1/licensing/*`.
- **No product fetches these keys.** `LICENSE_FILE` installations need `LICENSE_PUBLIC_KEYS` (JSON `[{kid,publicKey}]`) set by hand, with one `LICENSE_ALGORITHM` for every key. Control's response shape is compatible: extra fields are ignored.
- Snapshots in `CONTROL_PLANE` mode are not signed. Their trust rests on TLS plus the service credential.
- `LICENCE_SIGNING_PUBLIC_KEY` and `LICENCE_SIGNING_KID` are empty in tfvars until the KMS key exists (platform `CONTRACT.md:167-169`).

### Migrations

| | Control | School |
|---|---|---|
| Migrations | 3 apply cleanly as `control_owner`. A rerun reports "No pending migrations" | All 92 apply cleanly (179 tables). The rerun is idempotent |
| Drift | `prisma migrate diff` against the schema: "No difference detected" | One trivial drift (SC-08) |
| Grants and runtime role | `apply-grants` ran. `control_app` is NOSUPERUSER and NOBYPASSRLS, cannot `CREATE` in public, and cannot `DELETE FROM audit_event` | — |
| Tenant isolation | — | 165 of 165 tables with a tenant column have RLS ENABLED and FORCED. 327 of 327 e2e/RLS tests pass as `munaxa_app` |

### Product behaviour compared with the shared contract

**Product codes.** Control's `PRODUCTS = ['school','work','docs']` is enforced in the database by `ck_*_product` CHECK constraints. The product keys match: School `SCHOOL_PRODUCT_KEY='school'`, Work `WORK_PRODUCT_KEY='work'`, Docs `DOCS_PRODUCT_KEY='docs'`.

**Payload fields.** Control builds `LicensePayload` and `EntitlementSnapshot` with `parseEntitlementSnapshot` and `parseLicensePayload`. The licence's `tenantId` is the `tenantRef` the operator types in. For School this must equal the School tenant UUID, and the installation is bound by `LICENSE_INSTALLATION_ID`.

**Entitlements.** School's keys (feature modules plus limits `students`, `campuses`, `staff` and `storage_gb`) satisfy `KEY_PATTERN`. Control does not check plan features against any product catalogue (CT-05).

**`LICENSE_FILE` and multiple tenants.** `LICENSE_FILE` serves one tenant per installation. Other tenants get a mismatch, which means NONE (`entitlements.ts:183`).

## 2. Findings

| ID | Sev | Location | Evidence | Impact | Remediation | Blocks | Status |
|---|---|---|---|---|---|---|---|
| SC-01 | High | school:.github/workflows/seed-environment.yml:120-124 (pre-fix); apps/api/scripts/seed-platform-owner.ts:30,120 | `[ -n "${PLATFORM_OWNER_PASSWORD:-}" ] \|\| unset PLATFORM_OWNER_PASSWORD` → `const PASSWORD = process.env.PLATFORM_OWNER_PASSWORD ?? 'ChangeMe123!'`; user upsert `mustChangePassword: false` and `update: { passwordHash, … }` | Seeding staging or production without the secret creates, or **resets**, the Platform Owner (all-tenant access) with a password published in the repo, and never forces a change | The workflow now fails when the secret is empty | nonprod, prod | fixed-in-local-commit b3d560c |
| SC-02 | High | school:.github/workflows/deploy.yml:181 (pre-fix); infra/postgres/app-role.sql:16-21 | migrate job: `psql "$DIRECT_DATABASE_URL" … -f infra/postgres/app-role.sql`; that file has `CREATE ROLE munaxa_app WITH LOGIN PASSWORD 'munaxa_app_dev'` if missing | On a fresh or restored staging or production database, the runtime login role is created with a committed password | Switched to `runtime-grants.sql` (the same grants; fails on a missing role, as verified locally). Deployment and restore runbooks updated | nonprod, prod | fixed-in-local-commit b3d560c |
| SC-03 | Medium | school:docs/deployment-staging.md §5 (pre-fix) | The env block listed no `LICENSING_MODE` or `CONTROL_PLANE_*` | An API configured from this guide refuses to start in production (school#18) | Added the three variables | nonprod | fixed-in-local-commit b3d560c |
| SC-04 | Medium | school:.github/workflows/deploy.yml:168-172, :176-178 | `if [ -z "$DIRECT_DATABASE_URL" ]; then echo "::warning::…skipping migrations."; exit 0` | A migrate run without its secret passes green, and the rollout then meets an unmigrated schema | Fail instead of skipping (left as a finding because it changes intended behaviour) | nonprod | open |
| SC-05 | Medium | school:.github/workflows/deploy.yml:191-204 | deploy job: `echo "No rollout target configured for this environment yet — images are published and ready."` | Ticking "Roll out the services" deploys nothing. Render staging is deployed by hand in the Render dashboard (autoDeployTrigger off); AWS by the platform stack | Document this, or remove the job until a target exists | neither | open |
| SC-06 | Medium | school:render.yaml:3,105-119 | Header says "Blueprint for Munaxa staging", but `domains: app.munaxa.com, admin.munaxa.com`, `NEXT_PUBLIC_ENV=staging`, `plan: free` | The staging blueprint claims the production hostnames. Syncing it would attach production domains to a free-tier staging service | Use staging hostnames, or rename it as production | prod | open |
| SC-07 | Medium | school (whole API) | No reference to Munaxa Identity. Auth is its own HS256 JWT (`auth/services/token.service.ts:48`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`) plus optional Firebase | School operators and users are not on the ecosystem Identity. School's own Platform Console and plan tables duplicate Control's role; under `CONTROL_PLANE` they no longer decide entitlements | Decision needed: integrate Identity, or accept stand-alone auth | prod (if Identity is a requirement) | open |
| SC-08 | Low | school:prisma/schema.prisma:3038 | Applied DB compared with the schema: `EmployeeNumberCounter.updatedAt` default `now()` in the DB, none in the schema | Cosmetic drift; the next `migrate dev` would generate an ALTER | Add `@default(now())`, or a migration | neither | open |
| SC-09 | Low | school:.github/workflows/publish-images-ecr.yml:118-127 | The admin image is built with `NEXT_PUBLIC_API_URL=https://school.test.munaxa.com/api/v1` or `https://school.munaxa.com/api/v1`, hard-coded | Hostnames are fixed in the workflow, not in env vars | Accept as is, or move to vars | neither | open |
| SC-10 | Low | school:.github/workflows/deploy.yml:107,119 | GHCR tags include `:latest` | A mutable tag (the ECR path uses digests) | Drop `latest` | neither | open |
| CT-01 | Medium | control:.github/workflows/publish-images.yml:21-23,78 | `on: push: tags: ['image/**']`, and the only protection is `environment: image-release`. There is no gate like School's `verify-environment` | If the `image-release` environment is missing or unprotected in this repo, GitHub creates it unprotected, the OIDC trust (`environment:image-release`) is still met, and a tag push publishes to ECR without approval. It publishes, but does not deploy | Add a gate job that reads the environment's protection rules, or make the workflow dispatch-only like School's | prod | open |
| CT-02 | Medium | control:apps/api/src/licensing/licensing.service.ts:89-91; docs/adr/0008…md:59 | `onModuleInit(){ await this.signer.selfTest(); }`; the ADR says "Products are unaffected" | KMS unavailable, or the permission missing, when a task starts means the whole API is down, entitlements included. Products degrade through the outage policy, so the ADR overstates their independence | Document it, or serve entitlements when only the self-test failed and refuse issuance | neither | open |
| CT-03 | Low | control:apps/api/src/entitlements/entitlements.service.ts:33-37 | A product mismatch, or a tenant not linked to the credential's deployment, gives `notFound` → product reads NONE | A credential bound to the wrong deployment drops every tenant to core-only at once, unlike 401 and 403, which count as outages | Accepted by design; document it in the runbook | neither | open |
| CT-04 | Low | control:apps/api/src/licensing/licensing.service.ts:81 | Previous keys are published with `algorithm: environment.LICENCE_SIGNING_ALGORITHM` | Rotating from RS256 FILE to ES256 KMS labels the old RS256 keys ES256. Products also hold one `LICENSE_ALGORITHM` | Add an `algorithm` per previous key | neither | open |
| CT-05 | Low | control:apps/api/src/core/products.ts:16-18; catalogue | Features accept any key matching `isKey`; there is no product catalogue | A misspelled feature in a plan silently grants nothing (fails closed) | Validate against each product's published catalogue | neither | open |
| CT-06 | Low | control:.env.example:34; apps/api/src/config/environment.ts:71; docs/operations/secrets.md:30 | "ADR-0008, proposed"; "Infrastructure goes in `infra/terraform/`" (no such directory; Control's infrastructure is munaxa-platform `infra/aws/stack`) | Docs do not match the code and the ADR | Corrected | neither | fixed-in-local-commit 48c36c9 |
| CT-07 | Low | control:apps/api/src/licensing/licensing.controller.ts:26 | `productParam = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/)`, not `productSchema` | An operator can produce a signed empty revocation list for a product that does not exist | Use `productSchema` | neither | open |
| CT-08 | Low | control repo | No `.env.example` for the portal (`CONTROL_API_URL`, `OPERATOR_ACCESS_*`, `PORT`); they are documented only in `docs/operations/deployment.md:65,110,171` | Minor | Add `apps/portal/.env.example` | neither | open |

## 3. School deployment workflows

| Workflow | Trigger | Deploys what, where | Gate | Secrets | Vars |
|---|---|---|---|---|---|
| deploy.yml | dispatch only | GHCR images `munaxa-api` and `munaxa-admin` (sha and latest); `prisma migrate deploy` plus grants from the CI runner; a no-op rollout | `production-gate`: verify-dispatch, then verify-environment (staging or production) | `PLATFORM_PACKAGES_TOKEN`, `GITHUB_TOKEN`, `DIRECT_DATABASE_URL` (env) | `DATABASE_ENVIRONMENT`, `DATABASE_HOST` (env) |
| deploy-cloudflare.yml | dispatch only (`confirm=production`) | `munaxademo` Cloudflare Worker (demo) | Gate on `production` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (env), `PLATFORM_PACKAGES_TOKEN`, `GITHUB_TOKEN` | — |
| render.yaml | Render Blueprint; `autoDeployTrigger: 'off'` | Render `munaxa-api` and `munaxa-admin` (frankfurt, free) | Manual Deploy in the dashboard | Render dashboard: `DATABASE_URL`, `CORS_ORIGINS`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM*`, `NEXT_PUBLIC_API_URL`; JWT secrets generated | — |
| publish-images-ecr.yml | dispatch only, from an `image/<sha>` tag on main | ECR `229251310592…/munaxa-school/{api,migrate,admin(-nonprod/-prod)}` via OIDC | verify-environment `image-release`; the commit must be on main | `PLATFORM_PACKAGES_TOKEN`, `GITHUB_TOKEN` | `AWS_IMAGE_PUBLISHER_ROLE_ARN` (repo var; the workflow fails while it is unset) |
| seed-environment.yml | dispatch only | Permission catalogue, Platform Owner, and optionally the demo tenant, into staging or production | Gate plus verify-database | `DIRECT_DATABASE_URL`, `PLATFORM_OWNER_PASSWORD` (now required), `PLATFORM_PACKAGES_TOKEN` | `PLATFORM_OWNER_EMAIL`, `DATABASE_ENVIRONMENT`, `DATABASE_HOST` |

- **No push trigger can deploy.** CI runs on `pull_request` only, and `deploy-gate.mjs lint` passes locally ("Deploy gates hold in 5 workflow(s) and 1 wrangler config(s)"; 39/39 gate tests pass).
- **Render** builds only when someone runs a manual deploy, but only once the Blueprint is synced. Before that, each service's own auto-deploy setting applies, and that cannot be seen from code.
- **Undocumented in the workflow docs:** `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` is referenced only as "munaxa-platform infra/aws gate G2". `PLATFORM_OWNER_EMAIL` as an environment variable is not listed in `docs/ops/deployment-gates.md` step 5.

## 4. Complete, partial, missing

**Complete**
- The licensing contract end to end: issuance, revocation lists and activation in Control; verification, outage degradation, persisted state and anti-rollback in School, Work and Docs.
- The production refusal of permissive modes, in all three products.
- KMS signing as ADR-0008 describes, plus its Terraform.
- Cloudflare Access verification on the API and the portal, required in production (`environment.ts` `OPERATOR_ACCESS_*`; portal `middleware.ts` returns 401 or 503).
- The ADR-0006 subject allow-list, required in production while MFA is off.
- Control health checks: `/health/live` and `/health/ready` (DB `SELECT 1`; 503 when the DB is down). The Dockerfile HEALTHCHECK is on `/health/live`, non-root.
- School RLS.
- School deploy gating.

**Partial**
- Public key distribution is manual.
- School's rollout job is a stub.
- School keeps its own subscription and Platform Console alongside Control.

**Missing**
- Munaxa Identity in School.
- A product catalogue in Control.
- An approval gate check on Control's image publishing.

**School modules (high level):** academics, attendance, admissions, finance, billing, e-invoicing, scheduling and timetable, people and HR, parent and student portals, communication, documents and PDF, reporting, year-end, storage, platform console, plus a Flutter mobile app. All of them have unit and e2e coverage.

## 5. Env var names

**Control API:**
- Core: `NODE_ENV`, `APP_VERSION`, `HOST`, `PORT`, `LOG_LEVEL`, `LOG_PRETTY`, `DATABASE_URL`.
- Operator auth: `OPERATOR_AUTH_ISSUER`, `OPERATOR_AUTH_AUDIENCE`, `OPERATOR_AUTH_ALGORITHM`, `OPERATOR_AUTH_PUBLIC_KEYS`, `OPERATOR_AUTH_CLOCK_SKEW_MS`, `OPERATOR_ORGANISATION_ID`, `OPERATOR_REQUIRE_MFA`, `OPERATOR_SUBJECT_ALLOWLIST`, `OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`.
- Licence signing: `LICENCE_SIGNING_BACKEND`, `LICENCE_SIGNING_PRIVATE_KEY_FILE` (FILE), `LICENCE_SIGNING_KMS_KEY_ID` (KMS), `LICENCE_SIGNING_PUBLIC_KEY` (KMS), `LICENCE_SIGNING_KID`, `LICENCE_SIGNING_ALGORITHM`, `LICENCE_PREVIOUS_PUBLIC_KEYS`, `LICENCE_MAX_TERM_DAYS`.
- Caching and limits: `ENTITLEMENT_CACHE_SECONDS`, `IDEMPOTENCY_RETENTION_HOURS`, `RATE_LIMIT_PER_MINUTE`, `SERVICE_RATE_LIMIT_PER_MINUTE`, `AUTH_FAILURE_LIMIT_PER_MINUTE`, `TRUST_PROXY_HOPS`.
- The KMS region comes from the ARN; there is no `AWS_REGION`.

**Control migrate:** `DATABASE_MIGRATION_URL`.

**Control portal:** `CONTROL_API_URL`, `PORT`, `NODE_ENV`, `OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`.

**School API:**
- Core: `NODE_ENV`, `PORT`, `API_GLOBAL_PREFIX`, `API_VERSION`, `DATABASE_URL`, `DIRECT_DATABASE_URL` (migrations and seed), `REDIS_URL` (optional; declared but unused), `TENANT_DATABASE_OVERRIDES`, `TENANT_DATABASE_DIRECT_OVERRIDES`, `CORS_ORIGINS`.
- E-invoicing and messaging: `EINVOICE_MASTER_KEY`, `EINVOICE_WORKER`, `SMS_PROVIDER`, `SMS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_ADMIN`, `EMAIL_FROM_FINANCE`, `EMAIL_SENDER_DOMAIN`, `PASSWORD_BREACH_CHECK`.
- Auth: `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_TTL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- Observability and throttling: `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `RBAC_SYNC_ON_BOOT`, `RBAC_SYNC_TIMEOUT_MS`.
- Licensing: `LICENSING_MODE`, `CONTROL_PLANE_URL`, `CONTROL_PLANE_TOKEN`, `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_ALGORITHM`, `LICENSE_INSTALLATION_ID`, `LICENSE_REVOCATION_PATH`.
- Storage and PDF: `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_S3_ENDPOINT` (and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` for local use only; ECS uses the task role), `PDF_ARABIC_FONT_PATH`.
- Migrate image: `DATABASE_MIGRATION_URL`.

**School seed:** `PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_PASSWORD`, `PLATFORM_OWNER_FIRST_NAME`, `PLATFORM_OWNER_LAST_NAME`, `PLATFORM_OWNER_ROLE`.

**School admin (build time):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_APP_HOST`, `NEXT_PUBLIC_CONSOLE_HOST`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.

## 6. Secret names

**Control runtime:**
- `DATABASE_URL` (the `control_app` password; bundle `control-api` = [`DATABASE_URL`]).
- `DATABASE_MIGRATION_URL` (bundle `control-migrate`).
- `LICENCE_SIGNING_PRIVATE_KEY_FILE` content, FILE backend only. With KMS there is no key material.
- Public, not secret: `OPERATOR_AUTH_PUBLIC_KEYS`, `LICENCE_SIGNING_PUBLIC_KEY`, `OPERATOR_ACCESS_AUDIENCE`.

**Control GitHub:**
- Secrets: `PLATFORM_PACKAGES_TOKEN` (falls back to `GITHUB_TOKEN`).
- Vars: `AWS_IMAGE_PUBLISHER_ROLE_ARN`.
- Environment: `image-release`.

**School runtime (bundle `school-api`):** `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CONTROL_PLANE_TOKEN`, `RESEND_API_KEY`. Optional: `EINVOICE_MASTER_KEY`, `SMS_API_KEY`, `FIREBASE_PRIVATE_KEY`, `SENTRY_DSN`, `TENANT_DATABASE_OVERRIDES`. The migrate bundle holds `DATABASE_MIGRATION_URL`.

**School GitHub:**
- Secrets: `PLATFORM_PACKAGES_TOKEN`, `DIRECT_DATABASE_URL` (env), `CLOUDFLARE_API_TOKEN` (env production), `CLOUDFLARE_ACCOUNT_ID` (env production), `PLATFORM_OWNER_PASSWORD` (env, now required for seeding).
- Vars: `DATABASE_ENVIRONMENT`, `DATABASE_HOST` (env), `PLATFORM_OWNER_EMAIL` (env), `AWS_IMAGE_PUBLISHER_ROLE_ARN` (repo).
- Environments: `staging`, `production`, `image-release`.

## 7. Startup dependencies, health checks, failure behaviour

**Control API**
- Needs valid configuration, or it exits 1 with a list of problems; checked by running it.
- Needs Postgres, and the signer self-test (FILE or KMS `Sign`).
- `/health/ready` answers 503 when the DB is down. `/health/live` is static.
- If KMS is unavailable at boot, the process exits (CT-02).
- If Identity's keys are wrong, operators are refused. If the Cloudflare Access certs cannot be fetched, operator routes answer 503 (portal: "Operator sign-in is unavailable"). Product routes are unaffected.

**School API**
- Needs valid configuration, including a non-permissive licensing mode in production, or it exits; checked by running it.
- Needs Postgres for readiness, which checks only the DB. Control is not needed at boot.
- If Control is down, entitlements degrade by age. If the licence file is missing or invalid, the tenant gets core modules only and is read-only.

## 8. Commands run (in scratch copies with tgz overrides, because GitHub Packages returns 401)

Setup:
- `pnpm pack` of 22 munaxa-platform packages (platform was already built at 0ae17f9 with a clean tree).
- `pnpm install --no-frozen-lockfile` in both scratch copies: OK.

| Check | Control | School |
|---|---|---|
| Migrations | `roles.sql`, then `pnpm db:migrate`: 3/3 applied plus grants; rerun has nothing pending; `migrate diff`: no difference | `prisma:deploy`: 92/92 applied; rerun has nothing pending; `app-role.sql` OK; `prisma validate`: valid; drift as SC-08 |
| format:check | Fails **only** on `package.json`, which the scratch overrides changed. Clean in the original | Same |
| lint | pass (2/2 tasks) | pass (13/13) |
| typecheck | pass (2/2) | pass (13/13) |
| test | api 83/83 (5 files, e2e against the DB); portal 43/43 | api 514/514 (64 suites); domain 6/6; utils 5/5 |
| e2e | — | 327/327 (52 suites). First attempt with `--runInBand` ran out of heap; passes with `NODE_OPTIONS=--max-old-space-size=6144` and the configured `maxWorkers:1` |
| build | pass | pass (8/8) |
| pnpm audit --audit-level high | 0 high; 1 low, 2 moderate | 0 high; 2 low, 15 moderate |
| Other | — | `node --test scripts/deploy-gate.test.mjs`: 39/39; `deploy-gate.mjs lint`: pass (also after my edits) |
| Runtime checks | Production boot with missing configuration refused. KMS boot deliberately not run (no AWS calls) | Production with no `LICENSING_MODE` refused; http Control refused; https unreachable Control boots and `/health/ready` answers 200 |
| After my edits | `environment.spec` plus `licence-signer.spec`: 30/30; prettier clean | `runtime-grants.sql` applies, and fails with `role "munaxa_app" does not exist` on a database without the role; YAML parses; prettier clean |

**Docker build:** not run. Both Dockerfiles need a GitHub Packages token for `@munaxa/*` under a frozen lockfile, which returns 401 here.

The disposable databases and Redis were stopped afterwards.

## 9. Proposed decision

**Control: READY FOR NON-PRODUCTION.**
- All checks pass, migrations are clean, and production configuration fails closed.
- KMS signing matches ADR-0008. Operator access requires Identity, the allow-list and Cloudflare Access in production.
- Before production: the KMS public key and kid in tfvars, a protected `image-release` environment (CT-01), and a documented answer to CT-02.

**School: READY FOR NON-PRODUCTION once b3d560c is pushed and merged.** Until then, SC-01 and SC-02 make seeding or migrating a reachable environment unsafe.
- Licensing fails closed in production. RLS is complete and the tests are green.
- **Not ready for production** while any of these is unresolved: SC-06 (the staging blueprint holds the production domains), SC-04 (a migration with no secret passes green), SC-05 (no rollout target), SC-07 (the Identity decision), and the manual distribution of licence public keys for on-premises installations.

## Local commits (not pushed)
- munaxa-control `48c36c9` docs: ADR-0008 is accepted, and Control's infrastructure lives in munaxa-platform infra/aws. Tests: `environment.spec` and `licence-signer.spec` 30/30; prettier.
- munaxa-school `b3d560c` fix(deploy): grant the runtime role without creating it, and seed no owner with the public default password. Tests: deploy-gate tests 39/39, `deploy-gate.mjs lint`, prettier, YAML parse, `runtime-grants.sql` checked on local PG16 (role present and role missing).
