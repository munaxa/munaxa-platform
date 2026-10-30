# 03 · Identity (Agent 3) — AWS Testing readiness report

| | |
| --- | --- |
| Report date | 30 Oct 2026, refreshed 15:25 UTC against live GitHub state |
| Agent | Agent 3, Identity |
| Repository | [`munaxa/munaxa-identity`](https://github.com/munaxa/munaxa-identity), `main` = [`b97b3ab`](https://github.com/munaxa/munaxa-identity/commit/b97b3abc9d3a5f5eedd4fbcbb51647d8b455cfee) |
| Interface read (not owned) | [`munaxa/munaxa-platform`](https://github.com/munaxa/munaxa-platform) `main` = `c4a1ad0` (`infra/aws/stack`, `infra/aws/CONTRACT.md`); `munaxa/munaxa-control` `main` = `739be21` (guard, permission catalogue); `munaxa/munaxa-work` `main` (verifier config) |
| Working branch | `claude/project-thread-3ugge1` (all three PRs came from it; branch restarted from `main` after each merge) |
| Overall status | **Ready for AWS Testing.** No open Identity PR. No Identity-side blocker. Remaining items are owner steps (section 12) and two design points for before Production (I2, I3). |

Legend used below: **[V]** verified in this session against code, GitHub or a local run; **[A]** assumption, not verified; **[R]** recommendation.

## 1. Scope

Audit the merged Identity implementation for AWS Testing: authentication, token issuance and
validation, integration with Work, Control, Docs and School, the container image and ECR workflow,
database migrations, health checks, secrets and runtime configuration, and security or
compatibility issues. Then fix what is in Identity's own repository by PR, and merge under the
standing rule (required checks green, no high or critical finding, no publish or deploy on merge).

Out of scope, and not touched: munaxa-platform Terraform (Agent 1 owns it), any AWS, Cloudflare,
Render, Supabase or secret change, image publishing, deploys and remote migrations.

## 2. Current implementation status

- **[V]** `main` at `b97b3ab` contains, in order: identity#1 (`44c9f49`, ECR workflow and
  `migrate` image), identity#2 (`9aa4dc1`), identity#3 (`594003f`) and identity#4 (`b97b3ab`).
- **[V]** No open pull requests in `munaxa/munaxa-identity` (checked through the GitHub API).
- **[V]** CI on `main` is green at every merge (section 6).
- **[V]** The platform `main` (`c4a1ad0`) now sets `TRUST_PROXY_HOPS = "1"` on the identity service
  (`infra/aws/stack/services.tf` line 124) and contains the `identity-bootstrap` run-only task
  (`infra/aws/stack/ops.tf` from line 195). Both of Identity's cross-repo requests have landed.
- **[V]** Nothing has been deployed: no ECR image exists from this work, and no Testing
  environment runs Identity. The only Identity image ever published is the GHCR image for Render
  (Sept 2026, run 34323444447).
- Stale remote branches remain, and none was deleted: `claude/aws-nonprod-account-decision`,
  `claude/aws-nonprod-dns-decision`, `claude/aws-nonprod-network-decision`,
  `claude/aws-staging-architecture`, `claude/confident-fermi-k3cdx2`,
  `claude/identity-bootstrap-tls`, `claude/identity-ecr-publish`,
  `claude/identity-migration-runner` and `claude/project-thread-zqsmfg`.

## 3. Files and components reviewed

All links are at `main` `b97b3ab`. Base URL: `https://github.com/munaxa/munaxa-identity/blob/b97b3abc9d3a5f5eedd4fbcbb51647d8b455cfee/`

| Component | Files |
| --- | --- |
| Configuration contract | `packages/config/src/environment.ts`, `packages/config/src/environment.test.ts` |
| Startup and middleware | `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/security/edge.middleware.ts` |
| Auth API | `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/cookies.ts` |
| Signing and security stack | `apps/api/src/platform/signing.ts`, `apps/api/src/platform/security.ts`, `apps/api/src/platform/cache.ts` |
| Health | `apps/api/src/health/health.controller.ts`, `apps/api/src/health/readiness.ts` |
| Database | `prisma/schema.prisma`, `prisma/migrations/20260901120000_identity_baseline/migration.sql` |
| Provisioning scripts | `apps/api/scripts/bootstrap-account.mjs`, `apps/api/scripts/seed-work-roles.mjs`, `apps/api/scripts/seed-control-roles.mjs` (new), `artifacts/control-permissions.json` (new) |
| Image | `apps/api/Dockerfile` (`build`, `migrate`, `prune`, `runtime` stages) |
| Workflows | `.github/workflows/ci.yml`, `.github/workflows/publish-images-ecr.yml`, `.github/workflows/publish-images.yml` |
| Runbooks | `docs/runbooks/aws.md`, `docs/runbooks/configuration-contract.md`, `docs/runbooks/key-rotation.md`, ADR-0003 (MFA deferred), ADR-0004 (one origin) |

Platform side, read only: `infra/aws/stack/services.tf` (`module "identity"`, Work and Control
verifier env), `infra/aws/stack/data.tf` (`secret_keys`), `infra/aws/stack/ops.tf`
(`identity-bootstrap`), `infra/aws/stack/edge.tf` (rules 30, 40, 50) and
`packages/platform/security/src/ratelimit.ts` (`BASELINE_RATE_LIMIT_RULES`). Control:
`apps/api/src/auth/authentication.guard.ts` and `artifacts/control-permissions.json`.

## 4. Work completed

| PR | Merged as | What | Origin |
| --- | --- | --- | --- |
| [identity#2](https://github.com/munaxa/munaxa-identity/pull/2) | [`9aa4dc1`](https://github.com/munaxa/munaxa-identity/commit/9aa4dc15c01b86bbae4b9f9234bd2282301e9e33) | `TRUST_PROXY_HOPS` (integer 0 to 10, default 0) applied as Express `trust proxy` in `main.ts`, with three new config tests | Finding I1 |
| [identity#3](https://github.com/munaxa/munaxa-identity/pull/3) | [`594003f`](https://github.com/munaxa/munaxa-identity/commit/594003fcfe2c865fd83d37bc5eba6e63be4534c1) | Seeds the Control operator roles (`control-operator-admin`: 10 grants; `control-operator-viewer`: 5 reads) from `artifacts/control-permissions.json` (copied from control `739be21`). Every `uses:` in the three workflows is pinned by commit SHA. Removes the empty root files `node`, `pnpm` and `munaxa-identity@0.1.0`. | Control C7, review R-07, R-11 |
| [identity#4](https://github.com/munaxa/munaxa-identity/pull/4) | [`b97b3ab`](https://github.com/munaxa/munaxa-identity/commit/b97b3abc9d3a5f5eedd4fbcbb51647d8b455cfee) | The bootstrap password stays out of ECS task overrides. The runbook uses the platform `identity-bootstrap` task and the one-run secret. The password is needed only to create an account. Adds `IDENTITY_OWNER_PASSWORD_FILE`. Scripts accept `DATABASE_MIGRATION_URL`. | Review R-16 / ledger T33 |

Answers sent to other agents:
- **Agent 4:** confirmed that Identity has no OIDC (section 9).
- **Agent 1:** asked for `TRUST_PROXY_HOPS = "1"`. It is now in platform `main`.

## 5. Work still in progress

None in Identity. Nothing is half-done on a branch: `claude/project-thread-3ugge1` holds only
merged history.

## 6. CI and test results (evidence)

**GitHub Actions, workflow `CI` (`ci.yml`, job `verify`).** All runs below completed with
conclusion `success`. **[V]**

| Run | Event | Commit | Link |
| --- | --- | --- | --- |
| 41044164906 | PR #2 | `7744a24` | https://github.com/munaxa/munaxa-identity/actions/runs/41044164906 |
| 41044397311 | push `main` after #2 | `9aa4dc1` | https://github.com/munaxa/munaxa-identity/actions/runs/41044397311 |
| 41071046076 | PR #3 | `ab5471a` | https://github.com/munaxa/munaxa-identity/actions/runs/41071046076 |
| 41071184725 | push `main` after #3 | `594003f` | https://github.com/munaxa/munaxa-identity/actions/runs/41071184725 |
| 41071629943 | PR #4 | `47c39a5` | https://github.com/munaxa/munaxa-identity/actions/runs/41071629943 |
| 41071826393 | push `main` after #4 | `b97b3ab` | https://github.com/munaxa/munaxa-identity/actions/runs/41071826393 |

The `verify` job runs these steps, as defined in `ci.yml`:
- format check, lint, Prisma generate, typecheck and build;
- provisioning the database roles, migrating from zero and granting the application role;
- `prisma validate`;
- unit tests, then the integration, security and conformance tests against the PostgreSQL and Redis service containers;
- the Work catalogue drift check;
- checks for key material and for secret values in the repository;
- `pnpm audit --audit-level high`.

I read the step list from the workflow file and the job conclusions from the API. I did not read the per-step logs.

**Local checks in this session.** These ran outside CI and support the PRs. **[V]**
- **identity#2:** the Identity config suite ran against `@munaxa/config` 2.4.1, built from
  munaxa-platform: 23 of 23 tests passed, 3 of them new. A strict `tsc` of `environment.ts` passed, and so did prettier.
- **identity#3:** I applied the baseline migration to PostgreSQL 16 as a
  `NOSUPERUSER NOBYPASSRLS` owner, then ran the role seed.
  - Without the organisation, it refused (exit 1).
  - Without `--organisation`, it refused.
  - With the organisation, it seeded 10 and 5 grants under FORCE row-level security. Without the tenant context, the owner saw 0 rows.
  - A second run was a no-op upsert.
- **identity#4:** same database setup, with `@munaxa/auth` and `@munaxa/crypto` built from munaxa-platform.
  - No password and no existing account: refused.
  - Password file: the account was created, and the stored hash verifies the password without its trailing newline (and does not verify it with the newline).
  - Role assignment with no password: succeeded.
  - Weak password: refused (`too-short`).
  - Unreadable password file: refused.
- The local PostgreSQL was a throwaway instance and has been removed. A full `pnpm install` of
  Identity was not possible here, because the GitHub Packages token is unavailable in this
  container, so the full suite ran only in CI.

**Not run.** **[V]** I did not run the full integration suite locally, build a Docker image, or test anything against AWS.

## 7. Infrastructure dependencies (all owned by munaxa-platform unless noted)

- An ECS service `identity` with 0.5 vCPU and 1 GB of memory, on port 4001, plus a Valkey sidecar on `127.0.0.1:6379`. The sidecar requires a password and runs with no persistence.
- ALB routes to Identity, all rules present on platform `main`:
  - rule 40: the identity host;
  - rule 50: `<work host>/api/auth/*`;
  - rule 30: `<operator host>/api/auth/*`, open only when Cloudflare Access or operator CIDRs are set.
- Health checks:
  - the ALB target group uses `/api/auth/health/ready`;
  - the container health check uses `/api/auth/health/live`.
- RDS PostgreSQL 16, database `identity`, with roles `identity_owner` (migrations) and `identity_app`
  (runtime, `NOBYPASSRLS`). The `db-admin` task creates both.
- Run-only tasks:
  - `identity-migrate`: the `migrate` image running `prisma migrate deploy`.
  - `munaxa-<env>-identity-bootstrap`: the operator organisation, its accounts and the Control roles.
- ECR repositories `munaxa-identity/api` and `munaxa-identity/migrate`, plus the image-publisher
  role (bootstrap).
- Secrets Manager bundles `<env>/identity` and `<env>/identity-migrate`, plus the one-run secret
  `<env>/identity-bootstrap`.
- DNS (Cloudflare, owner): the identity host is DNS only. Per `CONTRACT.md` it is `id.test.munaxa.com` **[V]**.

## 8. Required environment variables (names only)

**`identity` service, plain** (set in `services.tf`):
- `NODE_ENV`, `PORT`
- `IDENTITY_BASE_URL`, `IDENTITY_AUTH_AUDIENCE`
- `IDENTITY_SIGNING_ALGORITHM`, `IDENTITY_SIGNING_KID`
- `IDENTITY_DEFAULT_ORGANISATION`
- `CSRF_TRUSTED_ORIGINS`
- `LOG_PRETTY`
- `TRUST_PROXY_HOPS`

**`identity` service, secret** (bundle `<env>/identity`):
- `DATABASE_URL`
- `IDENTITY_SIGNING_PRIVATE_KEY`
- `IDENTITY_SIGNING_SECRET`
- `REDIS_URL`
- `REDIS_PASSWORD` (the Valkey sidecar reads it; the app does not, I7)

**`identity` service, optional with defaults:**
- `HOST`, `APP_NAME`, `APP_VERSION`, `BUILD_SHA`
- `DATABASE_POOL_SIZE`
- `LOG_LEVEL`
- `SESSION_IDLE_TIMEOUT`, `SESSION_ABSOLUTE_TIMEOUT`, `SESSION_MAX_CONCURRENT`, `SESSION_COOKIE_MAX_AGE`
- `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`
- `PASSWORD_MIN_LENGTH`, `PASSWORD_HISTORY`, `PASSWORD_BREACH_CHECK`
- `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT`
- `AUDIT_ENABLED`

Each secret also accepts `<NAME>_FILE`.

**`identity-migrate` task:** `NODE_ENV`, and `DATABASE_MIGRATION_URL` (secret, `<env>/identity-migrate`).

**`identity-bootstrap` task:**
- `NODE_ENV`;
- `DIRECT_DATABASE_URL` (secret, taken from `identity-migrate` key `DATABASE_MIGRATION_URL`);
- `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` (one-run secret `<env>/identity-bootstrap`).

Outside ECS, the scripts also accept `IDENTITY_OWNER_PASSWORD_FILE` and `DATABASE_MIGRATION_URL`.

**Consumers, values supplied by the platform:**
- Work: `PLATFORM_AUTH_ISSUER`, `PLATFORM_AUTH_AUDIENCE`, `PLATFORM_AUTH_ALGORITHM`, `PLATFORM_AUTH_PUBLIC_KEYS`.
- Control: `OPERATOR_AUTH_ISSUER`, `OPERATOR_AUTH_AUDIENCE`, `OPERATOR_AUTH_PUBLIC_KEYS`, `OPERATOR_ORGANISATION_ID`, `OPERATOR_SUBJECT_ALLOWLIST`, `OPERATOR_REQUIRE_MFA`.

**CI and image publishing:**
- repository variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`;
- secret `PLATFORM_PACKAGES_TOKEN`;
- GitHub environment `image-release`.

## 9. Authentication integration contract

All points in this section are **[V]**, read from the code.

- **Issuer:** `iss` = `IDENTITY_BASE_URL` = `https://<identity host>`, with no trailing slash and no
  `/api/auth` suffix on AWS. Verifiers compare it character for character.
- **Algorithm:** ES256 only. A symmetric algorithm is refused by the config. The JWS header
  carries `kid` = `IDENTITY_SIGNING_KID`.
- **Keys:** public keys are distributed out of band as JSON
  `[{"kid": "...", "publicKey": "<SPKI PEM>"}]` (platform variable `identity_public_keys`). Rotation
  order: add the new `kid` to every verifier before Identity signs with it (`key-rotation.md`).
- **Access token claims** (`@munaxa/auth` `AccessTokenClaims`):
  - `sub`, `tid` (organisation), `sid`;
  - `iss`, `aud` (array; on AWS `munaxa-work`, `munaxa-control`);
  - `iat`, `exp` (default TTL 15 minutes), `jti`, `ver` (account token version);
  - optional `amr`, `mfa` (never true today), `roles`, `perms` (resolved permission strings).
- **Endpoints** (prefix `/api/auth`; none needs a credential):
  - `GET /login`, the sign-in page. `returnTo` must be a relative path.
  - `POST /login`, with a JSON or form body. Returns `200 {ok:true}` or a 303 redirect, and sets cookies.
    Errors: 401 `AUTH_INVALID_CREDENTIALS`, `AUTH_MFA_REQUIRED` or `AUTH_PASSWORD_POLICY`; 429
    `AUTH_RATE_LIMITED` with `retry-after`; 503 `AUTH_UNAVAILABLE`.
  - `POST /refresh` rotates the tokens.
  - `POST /logout`.
  - `GET /session` returns the subject and expiry, never a token.
  - `GET /health/live` and `GET /health/ready`.
- **Cookies:**
  - `__Host-mx_session` holds the access token: HttpOnly, Secure, SameSite=Lax, Path=/, host-only.
  - `__Secure-mx_refresh` is scoped to Path `/api/auth/refresh`.
  - No token ever appears in a response body. So every browser origin must route its own
    `/api/auth/*` to Identity (an ALB rule) and appear in `CSRF_TRUSTED_ORIGINS`. Today that is the
    identity, Work and operator hosts.
- **Consumers:**
  - **Work** verifies the signature, `exp` (30 s skew), `iss` and `aud` overlap with `munaxa-work`.
  - **Control** additionally requires:
    - the Cloudflare Access JWT;
    - `tid == OPERATOR_ORGANISATION_ID`;
    - a `sid`;
    - the subject on the allow-list;
    - `control:*` permissions from the catalogue.
  - **Docs and School** do not consume Identity tokens.
- **No OIDC:** there is no discovery, authorize, token or JWKS endpoint, and no ID token, by design
  (ADR-0004). Docs cannot federate to Identity. Adding OIDC would be new feature work, not a deployment fix.
- **Bring-up order:**
  1. `identity-migrate`
  2. `identity` reports ready
  3. `identity-bootstrap` steps 0 to 4 in `docs/runbooks/aws.md`, which yield
     `OPERATOR_ORGANISATION_ID` and the operator `sub`
  4. restart `identity`
  5. set `control_operator_organisation_id` and `control_operator_subjects`
  6. Control
  7. Work

## 10. Security findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| I1 | No `trust proxy`: behind the ALB, every client shared the ALB's address, so the per-IP login limit (10 per 15 minutes) was one global counter and a few bad logins returned 429 to everyone. | High | **Fixed:** identity#2 `9aa4dc1`, plus platform `TRUST_PROXY_HOPS = "1"` (in platform `main` `c4a1ad0`) **[V]** |
| I2 / R-06 | `IDENTITY_AUTH_AUDIENCE = munaxa-work,munaxa-control`: one token is valid at both. | Medium | **Open.** Mitigated for Testing by Control's checks (section 9). Per-product audience is an Identity code change. **[R]** before Production. Owner decision. |
| I3 | `mfaSatisfied` is hard-coded `false` (ADR-0003); no MFA. | Medium | **Open.** Accepted for Testing: `OPERATOR_REQUIRE_MFA=false`, with the allow-list and Cloudflare Access as the second factor. **[R]** before Production. |
| R-16 | The bootstrap password could only be fed by a run-task override, which is visible in DescribeTasks and CloudTrail. | Medium | **Fixed:** identity#4 `b97b3ab`, plus platform `identity-bootstrap` task **[V]** |
| R-07 | Third-party actions pinned by tag in workflows that hold AWS OIDC credentials. | Medium | **Fixed:** identity#3 `594003f` **[V]** |
| C7 | No seed for `control:*` roles, so every operator route would answer 403. | Info (setup) | **Fixed:** identity#3 `594003f` **[V]** |
| I4 | Docs and School are not Identity consumers. | Info | By design for Testing |
| I5 | Valkey has no persistence, so lockout and rate-limit counters reset on restart. | Low | Accepted for Testing |
| I6 | On the operator host (Cloudflare proxied), one hop yields the Cloudflare edge IP, not the client's. | Low | Accepted: the host is behind Access. Documented in `aws.md`. |
| I7 | `REDIS_PASSWORD` is injected into the app container, which does not read it. | Info | Harmless |
| R-11 | Stray empty root files. | Low | **Fixed:** identity#3 |

Checked and found sound **[V]**:
- **Signing key:** the config refuses a public key or a non-PEM value.
- **Production config:** https is required for the issuer, `REDIS_URL` is required, and `CSRF_TRUSTED_ORIGINS` is required.
- **Edge:** the origin allow-list is enforced at the edge, and there is an open-redirect guard.
- **Readiness:** it returns 503 and names a dependency, never a credential.
- **Runtime image:** runs as the non-root user `identity`, with no development toolchain. It started read-only with all capabilities dropped (identity#1 evidence).
- **`migrate` image:** runs as the user `migrate`.
- **ECR workflow:**
  - triggered only by an `image/<40-hex>` tag on `main`, in the `image-release` environment, through OIDC;
  - publishes no `latest`;
  - `PLATFORM_PACKAGES_TOKEN` is passed as a BuildKit secret.
- **Workflow tests:** they generate key material at runtime, and CI checks that no key and no secret value is committed.

## 11. Cost implications

**[A]** The figures below are estimates at eu-central-1 on-demand prices from memory; I did not check them against the live price list.
- One task of 0.5 vCPU and 1 GB, with the Valkey sidecar inside it, plus one public IPv4.
- Always on: about US$21 to 22 a month. During on-demand Testing sessions: about US$0.03 per hour.
- The `identity-bootstrap` and `identity-migrate` tasks are run-only, so they cost seconds per run.
- The database, ALB, KMS and secrets are shared stack costs, counted by Agent 1.

## 12. Blockers and owners

There are no Identity code blockers. Before Identity can run in Testing, these steps are needed:

| Item | Owner |
| --- | --- |
| Create the GitHub environment `image-release` with a required reviewer; set repository variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`; push tag `image/<sha of main>` to publish `api` and `migrate` | Tamer |
| Generate the signing key (`pnpm keys:generate`); write the `<env>/identity` and `<env>/identity-migrate` values; set `identity_signing_kid` and `identity_public_keys` (public half only) | Tamer |
| Pin the image digests and secret versions in tfvars, then apply at the platform gates | Tamer, via Agent 1's runbook |
| Create the one-run secret `<env>/identity-bootstrap`, run steps 1 to 3 of `docs/runbooks/aws.md`, and only then delete the secret; restart `identity` | Tamer |
| On the first bootstrap run, confirm that the secret ARN without its random suffix resolves; if it does not, the platform must use the full ARN | Tamer, then Agent 1 if it fails |
| Set `control_operator_organisation_id` and `control_operator_subjects` from the bootstrap output | Tamer |
| Decide whether per-product audiences (I2) and MFA (I3) are required before Production | Tamer |

## 13. Recommended next actions

1. **[R]** In the first Testing session:
   - run `identity-migrate`, then confirm `/api/auth/health/ready` returns 200 with `cache: redis`;
   - run the bootstrap steps, then sign in on the operator host;
   - check that a wrong password from one client does not 429 a second client. This verifies I1 end to end.
2. **[R]** Before Production:
   - per-product token audience (I2);
   - MFA claim (I3);
   - re-run `pnpm audit` and refresh the action SHAs on a schedule.
3. **[R]** Delete the stale `claude/*` branches listed in section 2 once nobody needs them. I did not do this: deletes are refused from this environment.

## 14. Not executed by this agent (explicit)

- No Terraform plan or apply, and no AWS API call of any kind for Identity.
- No AWS, KMS or Secrets Manager resource created, changed or read for a value.
- No secret value generated, written, read or stored. No signing key generated.
- No image built or published (neither ECR nor GHCR), no `image/*` tag pushed, no deploy.
- No migration or script run against a remote database. All database runs used a throwaway local PostgreSQL 16.
- No Cloudflare, Render or Supabase change.
- No change to munaxa-platform, munaxa-control, munaxa-work, munaxa-docs or munaxa-school.
- No branch deleted and no branch protection changed.
- I did not run the full Identity test suite locally; it ran in CI only (section 6).
