# Agent 2: Control Plane readiness for AWS Testing

| Field          | Value                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Agent          | Agent 2, Control Plane                                                                                      |
| Report date    | 30 Oct 2026; last validated against live GitHub state at 15:20 UTC                                          |
| Repository     | [`munaxa/munaxa-control`](https://github.com/munaxa/munaxa-control)                                         |
| `main` at check | [`739be21`](https://github.com/munaxa/munaxa-control/commit/739be21ef6dc25281848945aa8dcc46b5162fb3f)      |
| Interface used | munaxa-platform `main` [`c4a1ad0`](https://github.com/munaxa/munaxa-platform/commit/c4a1ad03541e0ebcc9cc2fd020d18a7a0edfb1ce) (`infra/aws/CONTRACT.md`, `infra/aws/stack/*`) and `/mnt/project-files/aws-testing/SHARED-CONTRACT.md` |
| Overall status | **Code ready for AWS Testing.** Running it needs the owner inputs in section 12. Nothing has been deployed. |

Marking used below: **[V]** verified against the repository, CI or a local run, with the evidence
named. **[A]** an assumption I did not verify. **[R]** a recommendation.

## 1. Scope and repository inspected

- **[V]** The Control Plane repository is `munaxa/munaxa-control`. Evidence: git remote
  `https://github.com/munaxa/munaxa-control`, `package.json` name `munaxa-control`, and the package
  description "the Munaxa Group subscription and licensing control plane for Munaxa School, Work
  and Docs".
- In scope:
  - Cloudflare Access verification in the API and the portal
  - operator portal and API protection
  - KMS licence signing
  - licensing and entitlement flows
  - Identity integration
  - health checks and runtime configuration
  - images and the ECR publishing workflow
  - the database migration job
  - what Control needs from the shared AWS stack
- Out of scope, and not done: creating the Cloudflare Access application, any change to Cloudflare,
  AWS, KMS or secrets, and any deploy (see section 14).

## 2. Current implementation status

| Area                                     | Status                                                                                          | Evidence                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Subscription and licensing API (NestJS)  | **[V]** Implemented and merged                                                                  | control#1 to #3                                                                                                               |
| Operator portal (Next.js 15, nonce CSP)  | **[V]** Implemented and merged                                                                  | control#1, #2                                                                                                                 |
| Cloudflare Access JWT, API and portal    | **[V]** Implemented                                                                             | control#5 (`fc59515`). Download routes fixed in control#6                                                                    |
| KMS licence signing (ADR-0008, Proposed) | **[V]** Implemented. The ADR status is still "Proposed"                                         | control#4 (`869fdb8`); [`docs/adr/0008-licence-signing-key-in-aws-kms.md`](https://github.com/munaxa/munaxa-control/blob/main/docs/adr/0008-licence-signing-key-in-aws-kms.md) |
| Images: `api`, `migrate`, `portal`       | **[V]** All three targets build in CI on `739be21`                                              | CI run 41070440509, job "Build the images"                                                                                    |
| ECR publish workflow                     | **[V]** Present. It does nothing until the owner sets `AWS_IMAGE_PUBLISHER_ROLE_ARN`. Actions pinned by SHA | [`.github/workflows/publish-images.yml`](https://github.com/munaxa/munaxa-control/blob/main/.github/workflows/publish-images.yml) |
| Deployed anywhere                        | **[V]** No. No ECR image, ECS service or migration run has come from this work                  | No publish run in the Actions history. I made no AWS call                                                                     |

## 3. Files and components reviewed

API (`apps/api/src`):
- `config/environment.ts`
- `main.ts`, `setup.ts`, `sweep.ts`
- `auth/authentication.guard.ts`, `auth/cloudflare-access.ts`, `auth/service-credentials.ts`,
  `auth/permissions.ts`
- `licensing/licence-signer.ts`, `licensing/licensing.controller.ts`
- `entitlements/products.controller.ts`
- `health/health.controller.ts`
- every `*.controller.ts`, for route paths and audiences

Portal (`apps/portal/src`):
- `middleware.ts`
- `lib/access.ts`, `lib/api.ts`, `lib/session.ts`
- `app/healthz/route.ts`
- `app/licences/[id]/download/route.ts`
- `app/products/[product]/revocation-list/route.ts`
- `next.config.mjs`

Build, release and CI:
- `Dockerfile`, `scripts/migrate.mjs`, `scripts/apply-grants.mjs`
- `infra/sql/roles.sql`, `infra/sql/grants.sql`
- `.github/workflows/ci.yml`, `.github/workflows/publish-images.yml`

Documentation:
- `.env.example`
- `docs/operations/deployment.md`
- `docs/integration.md`
- `artifacts/control-permissions.json`

Cross-repository, read only:
- munaxa-platform `infra/aws/stack/services.tf`, `edge.tf`, `data.tf`, `ops.tf` and `variables.tf`,
  plus `infra/aws/modules/service/*` and `infra/aws/CONTRACT.md`
- munaxa-identity `packages/config/src/environment.ts` (the issuer), `apps/api/src/auth/*`,
  `apps/api/scripts/seed-control-roles.mjs`, `artifacts/control-permissions.json` and
  `docs/runbooks/aws.md`

## 4. Work completed

1. **[V]** Confirmed the repository and the live state: `main` was `fc59515` at the start, CI on
   `main` was green, and no PRs were open.
2. **[V]** Audited every area in sections 1 to 3. Findings are in section 9.
3. **[V]** Fixed C1, C2, C3, R-07 and R-12 in **control#6**, which is merged as `739be21` (section 6).
4. **[V]** Reproduced C2 and verified its fix locally:
   - Image: `node:22-bookworm-slim@sha256:de170b39…`, the base the Dockerfile pins.
   - Before the fix: `corepack prepare` runs as root, the container runs as `node` with
     `--network none`, and `pnpm -v` fails because corepack tries to download pnpm
     (`Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-10.33.0.tgz`).
   - After the fix (`COREPACK_HOME=/corepack`, `chmod -R a+rX /corepack`), with the same user and
     no network:
     - `pnpm -v` prints `10.33.0`.
     - `pnpm --filter @control/api exec prisma migrate deploy` succeeds on a stub workspace
       owned by root.
5. **[V]** Wrote this report and the environment-variable inventory (section 8).

## 5. Work still in progress

None in Control. The rest is owner input or work in another repository (section 12).

## 6. PRs created

| PR                                                         | Branch                          | Head SHA  | Status                                            | Contents                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------- | --------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [control#6](https://github.com/munaxa/munaxa-control/pull/6) | `claude/project-thread-tccr1u`  | `d68e1a7` | **Merged** 30 Oct 14:16:35 UTC as squash `739be21` | C1: portal downloads forward `Cf-Access-Jwt-Assertion`, and new `apps/portal/src/lib/api.spec.ts` (4 tests). C2: `COREPACK_HOME`. C3: publish token falls back as in CI. R-07: every publish action pinned by SHA. R-12: Dockerfile header. `deployment.md` portal row |

Commits on the branch:
- `9f63c9a`: the fixes
- `3b9b4a1`: lint fix, action pinning, Dockerfile header
- `d68e1a7`: prettier

I merged under Tamer's standing rule:
- both required checks were green on the head SHA (`expectedHeadSha` given to the merge)
- there were no review threads
- the merge publishes and deploys nothing, because `publish-images.yml` runs only on an
  `image/<sha>` tag

Action SHAs pinned in `publish-images.yml`:
- `actions/checkout`: `d23441a…` (v6)
- `docker/setup-buildx-action`: `8d2750c…` (v3)
- `docker/build-push-action`: `10e90e3…` (v6)
- `aws-actions/configure-aws-credentials`: `e125382…` (v6)
- `aws-actions/amazon-ecr-login`: `03f1aad…` (v2)

All five were resolved with `git ls-remote` against each action's tag on 30 Oct.

Earlier Control PRs, by other threads, for reference:
- control#5: merged 09:32 UTC, `fc59515`
- control#4: merged 04:11 UTC, `869fdb8`
- control#3: 29 Oct, `9c064b3`
- control#2: 29 Oct, `37e09e3`
- control#1: 28 Oct, `a8ad357`

## 7. CI and test results (actual runs)

| Run                                                                                     | Event / SHA                 | Result                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [41034199279](https://github.com/munaxa/munaxa-control/actions/runs/41034199279)        | push `main` `fc59515`       | success. Baseline before this work                                                                                                                             |
| [41044411434](https://github.com/munaxa/munaxa-control/actions/runs/41044411434)        | PR `9f63c9a`                | **failure.** Both jobs failed on ESLint `@typescript-eslint/no-unnecessary-type-assertion` at `api.spec.ts` 26:5 and 59:42. The image job failed because `next build` runs the same lint |
| [41068217333](https://github.com/munaxa/munaxa-control/actions/runs/41068217333)        | PR `3b9b4a1`                | cancelled, superseded by the next push (concurrency group)                                                                                                     |
| [41068255914](https://github.com/munaxa/munaxa-control/actions/runs/41068255914)        | PR `d68e1a7`                | **success.** Jobs "Format · Lint · Typecheck · Test · Build" (124106094140) and "Build the images" (124106094424)                                              |
| [41070440509](https://github.com/munaxa/munaxa-control/actions/runs/41070440509)        | push `main` `739be21`       | **success**                                                                                                                                                    |

The CI verify job runs:
- Postgres 16
- roles and migrations, through the documented procedure
- format, lint, typecheck, the tests, and the build
- a check that the permission catalogue is current
- `pnpm audit --audit-level high`

The image job builds `api`, `migrate` and `portal` and pushes nothing.

Not run locally:
- **[V]** I could not run the full suite locally. `pnpm install` fails with
  `ERR_PNPM_FETCH_401` because `@munaxa/*` needs a GitHub Packages token, and this sandbox has
  none. Locally I ran Prettier only (all files pass) plus the Docker experiment in section 4.
- **[V]** I did not run the full `migrate` image end to end against a database, for the same token
  reason. The pnpm and corepack behaviour it depends on is verified (section 4), and CI builds the
  image.

## 8. Required environment variables (names only, no values)

### control-api (ECS service, port 3100)

| Name                                                                                                                                                                                                                                                       | Kind                                         | Provided by platform `c4a1ad0` [V]                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `NODE_ENV`, `PORT`                                                                                                                                                                                                                                         | env                                          | yes (`production`, `3100`)                             |
| `DATABASE_URL`                                                                                                                                                                                                                                             | **secret** (bundle `<prefix>/control-api`)   | key declared; the owner writes the value               |
| `OPERATOR_AUTH_ISSUER`                                                                                                                                                                                                                                     | env                                          | yes, `https://<hosts.identity>`                        |
| `OPERATOR_AUTH_AUDIENCE`                                                                                                                                                                                                                                   | env                                          | yes, `munaxa-control`                                  |
| `OPERATOR_AUTH_PUBLIC_KEYS`                                                                                                                                                                                                                                | env (public keys only)                       | yes, `identity_public_keys`                            |
| `OPERATOR_ORGANISATION_ID`                                                                                                                                                                                                                                 | env                                          | yes, `control_operator_organisation_id`                |
| `OPERATOR_REQUIRE_MFA`                                                                                                                                                                                                                                     | env                                          | yes, `false`                                           |
| `OPERATOR_SUBJECT_ALLOWLIST`                                                                                                                                                                                                                               | env                                          | yes, `control_operator_subjects`                       |
| `OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`                                                                                                                                                                                                  | env (public identifiers)                     | yes, `operator_access`                                 |
| `LICENCE_SIGNING_BACKEND`                                                                                                                                                                                                                                  | env                                          | yes, `KMS`                                             |
| `LICENCE_SIGNING_KMS_KEY_ID`                                                                                                                                                                                                                               | env                                          | yes, the key ARN                                       |
| `LICENCE_SIGNING_PUBLIC_KEY`                                                                                                                                                                                                                               | env (public)                                 | yes, `control_licence_public_key`                      |
| `LICENCE_SIGNING_KID`, `LICENCE_SIGNING_ALGORITHM`                                                                                                                                                                                                         | env                                          | yes (`control_licence_kid`, `ES256`)                   |
| `TRUST_PROXY_HOPS`                                                                                                                                                                                                                                         | env                                          | yes, `1`                                               |
| `APP_VERSION`, `HOST`, `LOG_LEVEL`, `LOG_PRETTY`, `OPERATOR_AUTH_ALGORITHM`, `OPERATOR_AUTH_CLOCK_SKEW_MS`, `LICENCE_PREVIOUS_PUBLIC_KEYS`, `LICENCE_MAX_TERM_DAYS`, `ENTITLEMENT_CACHE_SECONDS`, `IDEMPOTENCY_RETENTION_HOURS`, `RATE_LIMIT_PER_MINUTE`, `SERVICE_RATE_LIMIT_PER_MINUTE`, `AUTH_FAILURE_LIMIT_PER_MINUTE` | optional; the defaults are fine              | not set                                                |
| `LICENCE_SIGNING_PRIVATE_KEY_FILE`                                                                                                                                                                                                                         | **must not be set** (refused with KMS)       | not set                                                |

- Task role: `kms:Sign` on the licence key only, with `ECDSA_SHA_256` digests.
- Egress needed:
  - 443 to KMS, ECR, CloudWatch Logs and Secrets Manager (the last through the execution role)
  - 443 to `<team>.cloudflareaccess.com/cdn-cgi/access/certs`
  - 5432 to RDS

### control-migrate (run-only task)

- `NODE_ENV` (env)
- `DATABASE_MIGRATION_URL`: **secret**, bundle `<prefix>/control-migrate`, the `control_owner` role

### control-portal (ECS service, port 3200)

- `NODE_ENV`, `PORT`, `HOSTNAME` (env)
- `CONTROL_API_URL`: env, `http://control-api.<env>.munaxa.internal:3100`
- `OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE` (env)
- No secret. Writable root filesystem (Next.js cache).

### Products that call Control (owned by Agents 4 to 6)

- `LICENSING_MODE=CONTROL_PLANE`
- `CONTROL_PLANE_URL=https://<hosts.control_api>`
- `CONTROL_PLANE_TOKEN`: secret, one per deployment, issued in the portal
- Docs also needs the Control host on `OUTBOUND_HTTP_ALLOWLIST`

## 9. Security findings and severity

| #   | Finding                                                                                                                                                                                                                                                                                                                                   | Severity                | Status                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **[V]** Portal `apiDownload` did not forward `Cf-Access-Jwt-Assertion`. The API's guard requires that header on every operator route whenever Access is configured, and production always configures it. So licence downloads and revocation-list downloads would have answered 401.                                                     | High (functional)       | **Fixed** in control#6. Covered by `api.spec.ts`                                                                                                                                                                                                                            |
| C2  | **[V]** The `migrate` image ran `pnpm` as `node`, but corepack had prepared pnpm only under `/root` (mode 700). Every run therefore downloaded pnpm from npm, and a run without network failed. Agent 7 raised the same finding as R-08.                                                                                                | Medium                  | **Fixed** in control#6. Verified offline (section 4)                                                                                                                                                                                                                        |
| C3  | **[V]** `publish-images.yml` built with `GITHUB_TOKEN` only, while CI uses `PLATFORM_PACKAGES_TOKEN \|\| GITHUB_TOKEN`.                                                                                                                                                                                                                   | Low                     | **Fixed** in control#6                                                                                                                                                                                                                                                      |
| R-07 | **[V]** The ECR publish job used tag-pinned third-party actions while holding AWS OIDC credentials. Raised by Agent 7.                                                                                                                                                                                                                  | Medium                  | **Fixed** in control#6 (pinned by SHA)                                                                                                                                                                                                                                      |
| R-12 | **[V]** The Dockerfile header said the signing key is mounted at run time, which is stale under KMS. Raised by Agent 7.                                                                                                                                                                                                                 | Low                     | **Fixed** in control#6                                                                                                                                                                                                                                                      |
| C4  | **[V]** ALB path patterns are case-sensitive, but Express routes are not. A deny on `/api/v1/admin/*` alone therefore let `/API/v1/Admin/*` reach the API on the public host. The API still required Access, Identity, the organisation, the allow-list and permissions, so the ALB rule was only a second line of defence. | Low                     | **Fixed by Agent 1** in platform#26 (`c4a1ad0`). The public host now forwards only `/api/v1/products/*`, `/api/v1/licensing/*` and `/health/*`. Rule 21 refuses everything else in any case. I checked these paths cover every route products call (`products.controller.ts`, `licensing.controller.ts` `public-keys`, `health.controller.ts`) |
| C5  | **[V]** Identity tokens carry both audiences (`munaxa-work,munaxa-control`), so a token issued for Work is also accepted by Control's audience check. Agent 7 raised the same finding as R-06.                                                                                                                                           | Medium                  | **Open, accepted for Testing.** Control also requires the Access JWT, `tid` equal to `OPERATOR_ORGANISATION_ID`, a session `sid`, and the subject allow-list. **[R]** Scope audiences per product before Production (Identity change)                                       |
| C6  | **[V]** Identity issues no `mfa` claim, so `OPERATOR_REQUIRE_MFA=false`.                                                                                                                                                                                                                                                                 | Medium                  | **Open, accepted for Testing.** The ADR-0006 allow-list applies, and Cloudflare Access is the second factor                                                                                                                                                                  |
| C7  | **[V]** Without Identity roles granting `control:*`, every operator route answers 403.                                                                                                                                                                                                                                                   | Info                    | **Addressed by Agent 3**: identity#3 (`594003f`) adds `seed-control-roles.mjs`, and platform#26 adds the `identity-bootstrap` task. Identity's copy of `artifacts/control-permissions.json` is byte-identical to Control's at `739be21` (checked with `diff`). Running the seed is an owner step |
| C8  | **[V]** `main` in munaxa-control is not branch-protected (GitHub API `protected: false`, checked at 15:20 UTC). Stale branches remain: `claude/affectionate-tesla-0ptzhd`, `claude/control-portal-csp`, `claude/control-revocation-list`, `claude/project-thread-zqsmfg`, `claude/project-thread-tccr1u`.                            | Low                     | **Open, owner**                                                                                                                                                                                                                                                              |
| C9  | **[A]** The API runs with a read-only root filesystem and no `/tmp` volume, because Fargate has no tmpfs. Code review found no write to disk: the Prisma library engine, pino logging to stdout, and the KMS SDK.                                                                                                                       | Info                    | **Unverified.** Confirm on the first Testing start                                                                                                                                                                                                                           |
| C10 | **[A]** The API calls KMS at startup (sign and verify a probe). If KMS is unreachable or the public key is wrong, the task exits non-zero and ECS restarts it.                                                                                                                                                                            | Info                    | This is by design and fails closed. **[R]** Watch for a restart loop on the first start                                                                                                                                                                                      |

Checked and found sound **[V]**:

Cloudflare Access verification, in both `auth/cloudflare-access.ts` and `lib/access.ts`:
- RS256 only.
- Keys come from `<team>/cdn-cgi/access/certs`, fetched with `redirect: 'error'` and a 3 s timeout.
- RSA keys must be at least 2048 bits.
- `iss` must equal the team domain, and `aud` must contain the AUD tag.
- `exp`, `nbf` and `iat` are checked with 30 s of skew.
- `type` must be `app`, and an email and `sub` are required.
- An unreadable key set fails closed with 503.
- Production refuses to start without `OPERATOR_ACCESS_*`.
- The portal middleware matcher excludes only `/healthz` and `/api/*`. The ALB routes `/api/*` on
  the operator host to Identity, and the portal has no `/api` routes.

Operator API guard (`authentication.guard.ts`):
- It is closed by default. A route with no audience, or with no declared permission, is refused.
- Checks run in this order: Access JWT, then the Identity token (signature, issuer, audience,
  expiry), then `tid`, `sid`, MFA when it is required, the allow-list, and the route's permissions.
- Failed credentials count toward the per-address limit.

KMS signing (`licence-signer.ts`):
- The region is parsed from the key ARN.
- Credentials come from the SDK default chain, which is the task role on ECS.
- It signs with `ECDSA_SHA_256` over `DIGEST`, which matches the platform's task-role and
  key-policy conditions.
- Signatures are converted from DER to P1363 and verified against the published key before use.
- Production must name its signing backend.

Platform key policy, as written in `services.tf`:
- The account administers the key but cannot sign with it.
- A `NoOtherSigner` deny and a `NoGrants` deny are in place.
- `prevent_destroy` was added in platform#26.

Service credentials:
- Each `mxc_…` credential is bound to one deployment of one product.
- Only its SHA-256 is stored.
- A tenant outside the deployment answers 404.

Cache headers:
- Every answer is `no-store` except entitlements, which are `private, max-age=30`.

Database:
- `control_app` has no DELETE or TRUNCATE.
- History, usage and audit are append-only.
- Grants are re-applied on every migrate.

Images:
- The base image is pinned by digest, and the lockfile is frozen.
- The registry token is passed as a BuildKit secret.
- Every target runs as `node`.
- The ECR workflow runs only on an `image/<40-hex>` tag that names a commit on `main`. It runs in the
  `image-release` environment and authenticates with OIDC. It never pushes `latest`.

## 10. Infrastructure dependencies (from the shared stack, verified in platform `c4a1ad0`)

- **Database:** a PostgreSQL database `control` on the shared RDS instance, with the roles
  `control_owner` (migrate) and `control_app` (runtime). The `db-admin` run-only task creates them.
- **KMS:** an asymmetric `ECC_NIST_P256` / `SIGN_VERIFY` key (`alias/munaxa-<env>-control-licence`),
  with the key policy described in section 9.
- **Secrets Manager bundles:** `<prefix>/control-api` (`DATABASE_URL`) and
  `<prefix>/control-migrate` (`DATABASE_MIGRATION_URL`).
- **ECS:** the `control-api` service (256 CPU / 512 MB, ALB health check `/health/ready`, container
  check `/health/live`), the `control-portal` service (256 / 512, `/healthz`), and the
  `control-migrate` run-only task.
- **ALB:**
  - `control_api` host: priority 20 (allow-list) and 21 (403)
  - `operator` host: priority 31 to the portal, with `/api/auth/*` going to Identity, and 39 (403)
- **Private DNS:** `control-api.<env>.munaxa.internal` for portal-to-API traffic. A security group
  allows only the portal into the API on port 3100.
- **Identity:** it must be running first, because Control's issuer, keys and audience come from it.
- **Cloudflare:** an Access self-hosted application on `operator-test.munaxa.com` (owner action).
- **GitHub:** the `image-release` environment and the `AWS_IMAGE_PUBLISHER_ROLE_ARN` repository
  variable (owner actions).

## 11. Cost implications

These are list prices from memory. **[A]** I did not check them against the AWS Pricing API.
Region eu-central-1, Fargate on-demand.

| Item                                   | USD/month if always on |
| -------------------------------------- | ---------------------- |
| control-api, 0.25 vCPU / 0.5 GB        | about 10.4             |
| control-portal, 0.25 vCPU / 0.5 GB     | about 10.4             |
| 2 public IPv4 addresses (public tasks) | about 7.3              |
| KMS asymmetric key                     | 1.0                    |
| 2 Secrets Manager secrets              | 0.8                    |
| Logs and KMS Sign requests             | under 1                |
| **Total**                              | **about 31**           |

- Control's idle cost, with services off between Testing sessions, is about **$1.80 a month**: the
  KMS key and the secrets.
- The shared ALB, RDS and private DNS zone are in Agent 1's estimate.
- **[R]** Run Control only during test sessions to stay inside the $50 target.

## 12. Blockers and their owners

Nothing in Control's code blocks the Testing start. These inputs are needed before Control can run:

| #   | Item                                                                                                                                                                                                                                                                   | Owner                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| B1  | Create the Cloudflare Access self-hosted application for `operator-test.munaxa.com`, and put its team domain and AUD tag in `operator_access`. Without it, the stack refuses Control images (variables validation), and the portal and API refuse to start in production. | Tamer (Cloudflare)                          |
| B2  | Fill in the tfvars: the image digests for `control_api`, `control_migrate` and `control_portal`, plus `control_operator_organisation_id`, `control_operator_subjects`, `control_licence_kid` and `control_licence_public_key`. | Tamer, with Agent 1                         |
| B3  | The KMS public key exists only after the key does. The first apply creates the key. Then export its public half into `control_licence_public_key`, and only after that start the API, or its startup probe exits the task (C10). | Tamer (apply), Agent 1 (sequence)           |
| B4  | Write the values of `DATABASE_URL` (`control_app`) and `DATABASE_MIGRATION_URL` (`control_owner`).                                                                                                                                                                    | Tamer                                       |
| B5  | Set `AWS_IMAGE_PUBLISHER_ROLE_ARN`, confirm the `image-release` environment reviewers, and push an `image/<sha>` tag on `739be21` or later.                                                                                                                          | Tamer                                       |
| B6  | Run `identity-bootstrap` for the operator organisation, the first operator and the Control roles.                                                                                                                                                                      | Tamer (runs the task); Agent 3 (runbook)    |
| B7  | Protect `main` in munaxa-control (C8).                                                                                                                                                                                                                                 | Tamer                                       |
| B8  | Decide on ADR-0008 (KMS signing), still "Proposed". The stack and the code assume KMS.                                                                                                                                                                                | Tamer                                       |

## 13. Recommended next actions [R]

1. Owner: B7 and B8 (both quick, and neither touches infrastructure).
2. Owner: B1 (Cloudflare Access application) and B5 (publisher role and image tag).
3. In the Testing session, in this order:
   1. Apply the stack and confirm the KMS key exists.
   2. Export the KMS public key, then set `control_licence_public_key` (B3).
   3. Write the secret values (B4).
   4. Run `db-admin`.
   5. Run `identity-migrate`, then `identity-bootstrap` (B6).
   6. Run `control-migrate`.
   7. Start `control-api`, check `/health/ready`, and look for no restart loop (C9, C10).
   8. Start `control-portal`.
   9. Sign in through Access on `operator-test.munaxa.com`.
   10. Issue a credential for each product deployment and write it as that product's
       `CONTROL_PLANE_TOKEN`.
4. Acceptance checks for Control:
   - `GET https://control-api.test.munaxa.com/api/v1/admin/dashboard` answers 403 from the ALB, in
     any letter case.
   - The portal answers 401 without an Access token.
   - A licence download and a revocation-list download both succeed through the portal (the C1
     regression).
   - `GET /api/v1/licensing/public-keys` returns `control_licence_kid`.
5. Before Production: scope audiences per product in Identity (C5), enable MFA (C6), and turn on
   the hourly sweep schedule, which the stack creates only for `prod`.

## 14. What I did not execute

I confirm I did **none** of the following:
- `terraform plan` or `apply`
- any AWS API call to create, modify or delete a resource: no AWS call at all in this work
- KMS key creation or key-policy change
- secret creation, reading or modification
- image publish or ECR push, and no `image/*` tag
- ECS deploy or task run
- remote database migration
- any Cloudflare change, including the Access application
- any Render or Supabase change
- branch-protection change or branch deletion
- retirement of any infrastructure

Docker use was local only: I pulled the public `node` base image to reproduce C2.
