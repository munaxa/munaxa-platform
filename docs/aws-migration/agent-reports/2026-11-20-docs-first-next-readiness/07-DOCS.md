# 07. Docs readiness

**Status:**
- Code: CODE COMPLETE — NOT DEPLOYED.
- Deployment: BLOCKED on owner steps A-3, A-4, A-5, A-6 and on Control (A-7 to A-10).
- No blocker was closed on AWS today, because closing any of them needs an AWS write.

## 1. Previously identified blockers, rechecked

| # | Blocker | Current evidence | Status |
| --- | --- | --- | --- |
| 1 | No `munaxa-docs/migrate` ECR repository | ECR has api, web, antivirus only [V]. `munaxa-docs/infra/terraform/bootstrap/ecr.tf` lists `["api","web","antivirus","migrate"]`: IMMUTABLE, scan_on_push, lifecycle policy, publisher role limited to the `image-release` environment and `refs/tags/image/*` [V code] | BLOCKED: A-3 (bootstrap plan and apply). Expected plan: +1 repository, +1 lifecycle policy, publisher role policy updated to push to `migrate`. To be confirmed at plan time |
| 2 | Images older than main | ECR newest Docs images at `f8a8bea` (25 Oct); main is `9d06698` [V] | BLOCKED: A-5 (release from main after docs#179) |
| 3 | Three Docs bundles empty | still zero versions [V metadata] | BLOCKED: A-4 (`docs-testing-secrets.sh bundles`; script hardened today) |
| 4 | Resend key and `notify.munaxa.com` | no key; domain not verified | owner decision A-6. A placeholder key is accepted by config (min length 1, refused only if it matches the example placeholder). Resend answers 401/403, which Docs retries 5 times with backoff and then dead-letters, so the app runs and mail does not send [V code] |
| 5 | No Control credential | needs Control C-1, C-2, session, and minting | BLOCKED: A-7 to A-9 |
| 6 | Image digest and secret-version pins | D-1 offline plan: 42 creates, services off (19 Nov report) | READY once 2 and 3 exist |
| 7 | Migration and provisioning sequence | docs-db-admin, then docs-migrate, then docs-provision (exit 0, or 4 = already provisioned), then `provision-delete`. The provision task reads the one-run secret by partial ARN `…:secret:munaxa-nonprod/docs-provision/munaxa-internal:<KEY>::` with `DEPLOYMENT_PROFILE=ON_PREMISE` for that task only [V code] | ready; `provision-delete` now refuses a secret without the script's Purpose tag (PR #143) |
| 8 | ECS task-role S3 access | the docs task role grants only `s3:GetObject`, `PutObject`, `DeleteObject`, `AbortMultipartUpload` on `bucket/*` and `ListBucket` on the bucket. The adapter uses GET, HEAD (checksum mode), PUT, copy (`x-amz-copy-source`, needs GetObject plus PutObject), DELETE and multipart. The bucket uses SSE-S3, so no KMS permission is needed [V code] | least privilege confirmed. docs#178 corrects the runbook |
| 9 | Licensing before and after the credential | `entitlement.service.ts` refuses with **402** when there is no valid snapshot; `CONTROL_PLANE_TOKEN` must be at least 32 characters and the marked placeholder is accepted only as "no licence". After `replace-key CONTROL_PLANE_TOKEN` and its pin apply, the snapshot is fetched and verified (ES256) [V code] | fail-closed as required |

## 2. Runtime configuration (`infra/aws/stack/docs.tf`) [V code]

| Setting | Value in Testing | Behaviour |
| --- | --- | --- |
| `NODE_ENV` | `production` | placeholder secrets, `LICENSING_MODE=NONE` and `MAIL_DRIVER=NONE` refused at start |
| `LICENSING_MODE` | `CONTROL_PLANE` | fails closed (402) |
| `MAIL_DRIVER` | `RESEND` | needs `MAIL_RESEND_API_KEY` |
| `DEPLOYMENT_PROFILE` | `CLOUD` | needs `TENANT_CATALOGUE` (written by the script) |
| `STORAGE_CREDENTIALS_SOURCE` | `ECS_TASK_ROLE` | no static S3 keys |

Further checks:

| Check | Evidence |
| --- | --- |
| Database connectivity | URLs `postgresql://<role>:<hex>@<endpoint>:5432/<db>?sslmode=require`, built by the script from the RDS endpoint; db-admin creates `edms_owner`, `edms_app` and the tenant database [V code] |
| Health | api `/api/health/live`, web `/login` (target-group health checks in the stack) |
| First admin | created by docs-provision from the one-run secret; the password policy is checked by the script before anything is created; MFA enrolment offered at first sign-in |
| Logging | pino redaction of password, token, secret, authorization and cookie paths (`core/observability/logger.ts`); `provision.ts` redacts error messages |

## 3. Build and release reproducibility

| Item | Finding | Change |
| --- | --- | --- |
| Build context and lockfile | one Dockerfile, `pnpm install --frozen-lockfile`, three targets from one commit (CI "Container images · three targets from one commit", "Release smoke · images from this commit") [V CI] | none |
| Base image | `node:22-bookworm-slim` by tag only: a rebuild of the same commit could pull a different base | **docs#179** pins `ARG NODE_IMAGE=node:22-bookworm-slim@sha256:e9f565d3…` (index digest read from Docker Hub on 20 Nov) for build, runtime-fs and runtime-debian |
| Release workflow | `publish-images.yml`: tag `image/<sha>` in environment `image-release`, OIDC role, push by digest, provenance and SBOM off, revision label verified [V code] | none |
| ECR | IMMUTABLE, scan_on_push, lifecycle | `migrate` missing (blocker 1) |
| Vulnerability scan | Docs api `f8a8bea`: MEDIUM 1, LOW 2 [V] | rescan on release |
| CI audit | `pnpm audit --audit-level high` fails on main since 20 Nov (`effect`, file 02 §3) | **docs#179** adds the override |

**Result:** after docs#179 merges, a Docs release from main is reproducible up to upstream Debian package updates. The digests are recorded at publish and pinned in D-1.
