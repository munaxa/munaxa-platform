# 06: munaxa School, AWS Testing readiness (Agent 6)

| | |
|---|---|
| Report date | 2026-10-30, refreshed 15:25 UTC against live GitHub |
| Agent | Agent 6, munaxa School |
| Repository | [munaxa/munaxa-school](https://github.com/munaxa/munaxa-school), `main` at [`54cf3eb`](https://github.com/munaxa/munaxa-school/commit/54cf3eb7b0e07a1b8a08d261cd324fa6f30d9687) |
| Cross-checked | [munaxa/munaxa-platform](https://github.com/munaxa/munaxa-platform) `main` at `c4a1ad0` (platform#26 merged): `infra/aws/stack/*`, `infra/aws/bootstrap/iam.tf`, `infra/aws/CONTRACT.md` |
| Working branch | `claude/project-thread-fhe4kt` (head `e08193b`, fully merged; restarted from `main` before each follow-up) |
| Overall status | **School code is ready for AWS Testing.** No open School PRs. What remains is applying the infrastructure (owner-gated) and the owner's GitHub and secret setup listed in section 10. |

Labels used below: **[V]** = verified in this session against the repo, CI, or a local check; **[A]** = assumption or not verifiable from this session; **[R]** = recommendation.

## 1. Scope

In scope: School API (`apps/api`), School admin (`apps/admin`), Dockerfiles, Prisma schema and migrations, `infra/postgres/*.sql`, every workflow in `.github/workflows/`, and the deploy-gate script (`scripts/deploy-gate.mjs`). Also School's integration with the shared stack, Control licensing, Identity and Firebase, plus tenant isolation.

Out of scope: the public demo `munaxademo` (Cloudflare Worker), the marketing Worker and `canteenhub-prod` (not touched). The Flutter mobile app (`apps/mobile`) was read only where it calls the upload API.

## 2. Current implementation status

| Area | Status | Evidence |
|---|---|---|
| Container images | Ready | [V] `apps/api/Dockerfile` targets `runtime` (user `nestjs`, port 4000) and `migrate` (user `migrate`); `apps/admin/Dockerfile` `runtime` (port 3000) |
| ECR publishing | Ready, inert until the owner sets it up | [V] `publish-images-ecr.yml`: dispatch-only, from tag `image/<40-hex sha>` on `main`, `image-release` environment, OIDC; actions pinned by SHA (#22) |
| Migrations on AWS | Ready | [V] `migrate` target runs `prisma migrate deploy` then `infra/postgres/runtime-grants.sql` with `DATABASE_MIGRATION_URL` |
| Runtime config vs stack | Matches | [V] `services.tf` `school_api` env and `data.tf` `school-api` bundle keys match `env.validation.ts` |
| File storage (S3) | Ready in code and in Terraform; not applied | [V] #21 and #23 merged; platform#26 bucket, CORS, task role, env merged |
| Licensing | Ready | [V] `LICENSING_MODE=CONTROL_PLANE`; production refuses `DATABASE` (#18) |
| Identity integration | **Not integrated (by design for Testing)** | [V] School issues its own HS256 JWTs; `CONTRACT.md` §7 says School keeps its own sign-in for Testing |
| Firebase sign-in | Off on AWS | [V] `FIREBASE_*` are not in the `school-api` bundle; password login is unaffected |
| Deploy safety | All side-effect workflows dispatch-only and gated | [V] see section 6 |

## 3. Files and components reviewed

- Config: [`apps/api/src/config/env.validation.ts`](https://github.com/munaxa/munaxa-school/blob/main/apps/api/src/config/env.validation.ts), [`apps/api/.env.example`](https://github.com/munaxa/munaxa-school/blob/main/apps/api/.env.example)
- Storage: [`apps/api/src/common/storage.service.ts`](https://github.com/munaxa/munaxa-school/blob/main/apps/api/src/common/storage.service.ts) and its spec, `apps/api/src/jobs/reconcile-storage.ts`, `apps/api/src/organization/organization.service.ts`, `apps/api/src/documents/branding.service.ts`
- Upload clients: `apps/admin/src/lib/organization.ts`, `apps/admin/src/app/(app)/people/employees/[employeeId]/tabs/documents-tab.tsx`, `apps/mobile/lib/data/finance/finance_api.dart`
- Auth: `apps/api/src/auth/services/firebase.service.ts`, `auth.service.ts` (verified-email linking, line 151)
- Bootstrap: `apps/api/src/main.ts` (helmet, CORS, `trust proxy` 1), `apps/api/src/prisma/tenant-connection.service.ts`
- Images: [`apps/api/Dockerfile`](https://github.com/munaxa/munaxa-school/blob/main/apps/api/Dockerfile), `apps/admin/Dockerfile`
- DB: `infra/postgres/app-role.sql`, `infra/postgres/runtime-grants.sql`, `prisma/schema.prisma`
- Workflows: [`ci.yml`](https://github.com/munaxa/munaxa-school/blob/main/.github/workflows/ci.yml), [`deploy.yml`](https://github.com/munaxa/munaxa-school/blob/main/.github/workflows/deploy.yml), [`deploy-cloudflare.yml`](https://github.com/munaxa/munaxa-school/blob/main/.github/workflows/deploy-cloudflare.yml), [`seed-environment.yml`](https://github.com/munaxa/munaxa-school/blob/main/.github/workflows/seed-environment.yml), [`publish-images-ecr.yml`](https://github.com/munaxa/munaxa-school/blob/main/.github/workflows/publish-images-ecr.yml), `scripts/deploy-gate.mjs`
- Docs: [`docs/ops/aws.md`](https://github.com/munaxa/munaxa-school/blob/main/docs/ops/aws.md)
- Platform: `infra/aws/stack/services.tf` (`school_api`, `school_admin`), `data.tf` (bundles), `storage.tf`, `network.tf` (S3 gateway endpoint), `edge.tf` (priorities 60-61), `ops.tf` (`school-migrate`), `scripts/db-bootstrap.sh`, `bootstrap/iam.tf` (publisher role trust), `CONTRACT.md`, `cloudflare-access.md`

## 4. Work completed (this execution)

| PR | Title | Merge SHA | CI run on PR head | Result |
|---|---|---|---|---|
| [#21](https://github.com/munaxa/munaxa-school/pull/21) | fix(storage): use the ECS task role for S3, and never stub uploads in production | [`c6ddd5a`](https://github.com/munaxa/munaxa-school/commit/c6ddd5a66cfd870d824e1e98f67e37ca2f5da94c) | [run 41044095832](https://github.com/munaxa/munaxa-school/actions/runs/41044095832) on head `f67fa31` | Merged 14:00 UTC after independent review (Agent 7, no blockers) |
| [#22](https://github.com/munaxa/munaxa-school/pull/22) | fix: pin the ECR publish actions by commit, and serve branding images as attachments | [`55b5f0f`](https://github.com/munaxa/munaxa-school/commit/55b5f0ffd07e6221fdcdfef7a9731b54ff267445) | [run 41068231182](https://github.com/munaxa/munaxa-school/actions/runs/41068231182) on head `0953ee9` | Merged 14:11 UTC |
| [#23](https://github.com/munaxa/munaxa-school/pull/23) | fix(storage): stop signing the SSE header into presigned uploads | [`54cf3eb`](https://github.com/munaxa/munaxa-school/commit/54cf3eb7b0e07a1b8a08d261cd324fa6f30d9687) | [run 41069902465](https://github.com/munaxa/munaxa-school/actions/runs/41069902465) on head `e08193b` (CI run #46, conclusion `success`) | Merged 14:20 UTC |

Check runs per PR [V], as read from the GitHub API:

| Check | #21 | #22 | #23 |
|---|---|---|---|
| Lint · Typecheck · Test · Build (JS/TS) | success | success | success |
| Security scans | success | success | success |
| Detect changed areas | success | success | success |
| Analyze · Test (Flutter) | skipped (no mobile change) | skipped | skipped |
| Supabase Preview | skipped | skipped | skipped |

Merge method: squash, with `expectedHeadSha` set to the green head. No review threads were open on any of the three. Branch protection was not bypassed.

What each PR changed:

- **#21**: `StorageService.configured` required `AWS_ACCESS_KEY_ID`. On ECS (task role, no keys) School would have issued stub URLs to `uploads.munaxa.local` while `commitUpload` recorded the file as stored. It now counts static keys, `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`/`_FULL_URI`, or `AWS_WEB_IDENTITY_TOKEN_FILE`. In production with no configured storage, `presignUpload`, `presignImageUpload` and `commitUpload` answer 503. Downloads are not refused. It also adds a File storage section to `docs/ops/aws.md`. Adds 3 tests.
- **#22**: Agent 7 finding R-07 pins the actions to commits: `actions/checkout` v6.1.0 `d23441a4`, `docker/setup-buildx-action` v3.12.0 `8d2750c6`, `aws-actions/configure-aws-credentials` v6.3.0 `e1253824`, `aws-actions/amazon-ecr-login` v2.1.7 `03f1aad4` (peeled annotated tag), `docker/build-push-action` v6.19.2 `10e90e36`. SHAs were resolved with `git ls-remote` on 30 Oct. Agent 7 finding R-10: branding presigned GETs now carry `ResponseContentDisposition: attachment`, so an SVG cannot render as a document on the bucket origin, while `<img>` still displays it. The test asserts it.
- **#23**: the presigned PUTs set `ServerSideEncryption`. The S3 presigner keeps `x-amz-server-side-encryption` as a signed header, and neither the admin nor the mobile client sends it, so every upload would have failed with a signature mismatch. The platform CORS would also have rejected the header. Local check [V] with `@aws-sdk/client-s3` 3.x and `s3-request-presigner` 3.1160.0: with SSE the signed headers are `content-length;host;x-amz-server-side-encryption`, without SSE `content-length;host`. Encryption now comes from the bucket default SSE-S3 (platform `storage.tf:72`). Adds 1 test.

Local checks: Prettier `--check` passed on every changed file [V]. The unit tests and `deploy-gate.mjs lint` could not run in this sandbox: there is no `@munaxa/*` package token, and the lint needs the workspace `yaml` dependency. They ran in CI as listed above [V].

## 5. Work still in progress

None in School. Nothing is open on GitHub ([V] `list_pull_requests state=open` is empty).

## 6. Deployment safety (verified)

| Workflow | Trigger | Gate |
|---|---|---|
| `ci.yml` | `pull_request` to `main` | none needed, no side effects |
| `deploy.yml` (GHCR, CI-runner migrate, Render-era) | `workflow_dispatch` only, target typed twice, each step ticked | `production-gate` plus a protected environment per job; migrate requires `DATABASE_ENVIRONMENT`/`DATABASE_HOST` |
| `deploy-cloudflare.yml` (demo Worker) | `workflow_dispatch` only, `confirm=production` | `production` environment |
| `seed-environment.yml` | `workflow_dispatch` only | environment per target |
| `publish-images-ecr.yml` | `workflow_dispatch` only, from `image/<sha>` tag on `main` | `production-gate` + `image-release` environment; the OIDC role trusts only `environment:image-release` and `refs/tags/image/*` (platform `bootstrap/iam.tf:279-288`) |

[V] The latest `workflow_dispatch` run in the repository is from 2026-08-03. No deploy, seed, Cloudflare or ECR workflow has been dispatched in this execution.

## 7. Infrastructure dependencies

All of these are defined in munaxa-platform `main` (`c4a1ad0`) **and none is applied** [V for the code; A for the live AWS state, which this session did not query].

| Resource | Where | Status |
|---|---|---|
| ECR repos `munaxa-school/api`, `/admin`, `/migrate` | `bootstrap/variables.tf:42` | code merged, not applied |
| Image publisher role (OIDC, `image-release` + `image/*`) | `bootstrap/iam.tf` | code merged, not applied |
| `school-api` service (256 CPU / 512 MB, port 4000, `/api/v1/health/ready`, ALB rule 60 `/api/v1/*`) | `stack/services.tf` | code merged, not applied |
| `school-admin` service (port 3000, `/login`, ALB rule 61) | `stack/services.tf` | code merged, not applied |
| `school-migrate` run-task | `stack/ops.tf:166` | code merged, not applied |
| DB `school_db`, roles `school_owner`, `munaxa_app` (NOSUPERUSER, NOBYPASSRLS) | `stack/scripts/db-bootstrap.sh` | code merged, not applied |
| S3 `munaxa-<env>-school-files-229251310592`: private, BPA, SSE-S3, TLS-only, CORS GET/PUT from `https://school.test.munaxa.com`, headers `content-type`, `content-length` | `stack/storage.tf` (platform#26) | code merged, not applied |
| Task role: `s3:PutObject/GetObject/DeleteObject` on `tenants/*`, `s3:ListBucket` on bucket | `stack/services.tf:636` | code merged, not applied |
| S3 gateway endpoint admits the bucket | `stack/network.tf` | code merged, not applied |
| Secret bundles `munaxa-<env>/school-api`, `munaxa-<env>/school-migrate` | `stack/data.tf` | containers in code; values are the owner's to write |
| DNS `school.test.munaxa.com` CNAME to the ALB, DNS only | `cloudflare-access.md:18` | owner action, not done |
| Control deployment credential for School | Control operator portal | owner action after Control runs |

Bring-up order: Identity, then Control, then a School credential issued in the portal, then the `school-migrate` run-task, then `school-api` and `school-admin`.

Cost [A, estimate]: School adds 2 Fargate tasks (0.25 vCPU / 0.5 GB each) only during Testing sessions, plus a share of the shared ALB/RDS. The S3 bucket with test data costs cents per month. School adds no always-on resource beyond the shared persistent layer. Account-level cost is Agent 1's and Agent 7's to report.

## 8. Required environment variables (names only)

**`school-api` plain (Terraform `environment`)** [V matches `services.tf`]: `NODE_ENV`, `PORT`, `API_GLOBAL_PREFIX`, `API_VERSION`, `CORS_ORIGINS`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `EMAIL_SENDER_DOMAIN`, `LICENSING_MODE`, `CONTROL_PLANE_URL`, `AWS_S3_BUCKET`, `AWS_REGION`.
Optional plain (defaults suffice): `EMAIL_FROM`, `EMAIL_FROM_ADMIN`, `EMAIL_FROM_FINANCE`, `PASSWORD_BREACH_CHECK`, `SENTRY_TRACES_SAMPLE_RATE`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `EINVOICE_WORKER`, `RBAC_SYNC_ON_BOOT`, `RBAC_SYNC_TIMEOUT_MS`, `PDF_ARABIC_FONT_PATH`, `SMS_PROVIDER`.

**`school-api` secret (`munaxa-<env>/school-api`)** [V matches `data.tf`]: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (must differ, boot refuses otherwise), `CONTROL_PLANE_TOKEN`, `RESEND_API_KEY`.
Optional secret, not in the bundle today: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (Firebase sign-in and push), `SENTRY_DSN`, `EINVOICE_MASTER_KEY` (only once a tenant enables e-invoicing), `SMS_API_KEY`, `TENANT_DATABASE_OVERRIDES`.

**Never set on AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ENDPOINT` (LocalStack only), `REDIS_URL` (declared, unused), `LICENSE_FILE_PATH`, `LICENSE_PUBLIC_KEYS`, `LICENSE_ALGORITHM`, `LICENSE_INSTALLATION_ID`, `LICENSE_REVOCATION_PATH` (on-premises only).

**`school-migrate` secret (`munaxa-<env>/school-migrate`)**: `DATABASE_MIGRATION_URL`.

**`school-admin`**: runtime `NODE_ENV`, `PORT`, `HOSTNAME`; build args `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ENV` (baked per environment, tags `-nonprod` / `-prod`).

**GitHub (munaxa-school)**: repository variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`; environment `image-release` with a required reviewer and a deployment tag rule `image/*`; secret `PLATFORM_PACKAGES_TOKEN` (already referenced by workflows). [A] Whether `image-release` exists with those rules was not verified from this session. `production-gate` checks it at run time and fails closed.

## 9. Security findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| S1 | High | Storage required an access key, so on ECS uploads were stubbed and recorded as stored | **Fixed**, #21 `c6ddd5a` |
| S2 | High (infra gap) | Stack had no School bucket, `AWS_S3_BUCKET` or S3 task-role policy | **Fixed in code**, platform#26 `c4a1ad0`; not applied |
| S8 | High | Presigned PUTs signed `x-amz-server-side-encryption`, which clients don't send, so every upload would fail | **Fixed**, #23 `54cf3eb` |
| R-07 (Agent 7) | Medium | ECR publish actions pinned by mutable tag while holding OIDC credentials | **Fixed**, #22 `55b5f0f` |
| S3 | Medium (accepted for Testing) | No Identity integration; School runs its own HS256 JWT auth | Open, later phase (`CONTRACT.md` §7) |
| S4 | Medium | Firebase sign-in/push disabled on AWS (keys not in bundle). Verified-email linking (#20 `2c07be4`) is on `main` | Open, owner choice |
| R-10 (Agent 7) | Low | SVG branding could render on the bucket origin | **Fixed**, #22 |
| S5 | Low | Rate limiting is in memory per task; `REDIS_URL` unused. Exact with 1 task in Testing, looser with 2 in prod | Open, accepted for Testing |
| S6 | Low | `trust proxy` is 1 hop (`main.ts:48`). Correct only while `school.test.munaxa.com` stays DNS-only to the ALB | Open, constraint to keep |
| S9 | Low (mobile, outside Testing) | Mobile receipt upload (`finance_api.dart:157`) streams bytes through Dio without an explicit Content-Length, while the presigned URL signs `content-length` | Open, needs a device test [A: not reproduced] |
| S7 | Info | `migrate` image is the full build stage (dev deps, source). No secrets in it (BuildKit secret, `.npmrc` removed); runs as non-root | Accepted |

Tenant isolation [V by code reading; the RLS behaviour was verified locally in the earlier hosting work (`docs/ops/aws.md`), not re-run here]: Postgres RLS through `munaxa_app` (NOBYPASSRLS); S3 keys `tenants/<tenantId>/...` with `assertKeyInTenant` before confirm or download; the task role is limited to `tenants/*`; `TENANT_DATABASE_OVERRIDES` unset, so every Testing tenant shares `school_db`.

## 10. Blockers and owners

| Blocker | Owner |
|---|---|
| Apply platform `bootstrap/` (ECR repos, publisher role, budget) as root | Tamer (gated) |
| Plan and apply platform `stack/` nonprod (DB, bucket, services) | Tamer approval (gated) |
| Set `AWS_IMAGE_PUBLISHER_ROLE_ARN`; create or confirm `image-release` environment rules | Tamer |
| Write `school-api` and `school-migrate` bundle values | Tamer |
| Issue the School `CONTROL_PLANE_TOKEN` in the Control portal (needs Control running) | Tamer, after Agent 2's bring-up |
| DNS `school.test.munaxa.com`, DNS-only CNAME to the ALB | Tamer (Cloudflare) |
| Publish School images, run `school-migrate`, start services | Tamer approval (gated) |
| No way to seed the first platform-owner login on AWS (see 11.4) | Tamer decision; Agent 1 if a stack task is chosen |

No School code blocker remains.

## 11. Recommended next actions

1. [R] After the gated applies: tag `image/54cf3eb7b0e07a1b8a08d261cd324fa6f30d9687` and dispatch `publish-images-ecr.yml` from that tag (approval in `image-release`).
2. [R] Pin the three resulting digests (`school_api`, `school_admin` `-nonprod`, `school_migrate`) in `nonprod.tfvars` by PR.
3. [R] Run `school-migrate`, then start the services in a Testing session. Smoke test: `GET /api/v1/health/ready` 200; unauthenticated `GET /api/v1/...` 401; admin `/login` loads; one upload (receipt or branding) completes PUT and confirm against the bucket; a licensed module answers per Control.
4. [R] Seed the first platform owner (`db:seed:platform-owner`). **Open gap:** neither the stack nor School defines an ECS task for seeding, and `seed-environment.yml` connects from a CI runner, which cannot reach the private RDS. A fresh Testing database has no login until this is decided.
5. [R, owner decision] Decide whether Testing needs Firebase sign-in (add 3 keys to the bundle) and how seeding should run (step 4).
6. [R] Before the mobile app is pointed at AWS, run a device test of a receipt upload (S9).

## 12. Explicitly not executed

None of the following was done by Agent 6 in this execution: Terraform plan or apply; any AWS resource creation, change or deletion (no AWS API calls were made); KMS or key-policy changes; Secrets Manager or GitHub secret creation, reading or change; image builds or pushes (ECR or GHCR); dispatching any workflow (deploy, seed, Cloudflare, ECR publish); application deployment; any database migration or seed, local against RDS or remote; Cloudflare, Render or Supabase changes; changes to the marketing Worker, `munaxademo` or `canteenhub-prod`; changes to the old Docs AWS stack. No secret value appears in this report.

The only side effects were three School PRs (#21, #22, #23), merged under the owner's standing merge rule with green required checks, plus files in the project folder.
