# Repository readiness matrix

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead. **Scope:** read-only code, workflow and GitHub metadata review of the six Munaxa repositories. CanteenHub was not inspected. No workflow was dispatched, no tag pushed, no image published.
- **Labels:** [V-repo] git content read in this task; [V-gh] GitHub API read in this task; [V-prior] an earlier dated report on main, not re-checked; [E] inference; [U] unknown.

## 1. Summary

| Repository | main | CI on the main commit | Open PRs | ECR images | Ready for Testing? |
| --- | --- | --- | --- | --- | --- |
| munaxa-platform | `016f3f5` (#48) at audit time; `c322459` (#49) after this task's first merge | Required checks run on PRs; PR #49 (docs only): all required checks green, after one re-run of an unrelated timing test (`packages/platform/auth` security test, wall-clock ratio 5.5 against a limit of 5) [V-gh] | #49 at audit time (this task, docs only; since merged) | n/a | Code yes; **AWS gates open** (G3 not applied, B2 open) |
| munaxa-identity | `5277d71` (#6) | CI push run 41992700652 **success** [V-gh] | none [V-gh] | **none** (0 `image/*` tags, 0 ECR publish runs) [V-gh] | Code yes; needs image, keys, secrets |
| munaxa-control | `a24c568` (#7) | CI push run 41122329528 **success** [V-gh] | none | **none** (0 tags, 0 runs) | Code yes; needs image, Cloudflare Access, licence key, operator subjects |
| munaxa-work | `b490b25` (#29) | CI is PR-only; PR #29 head: 4/4 checks **success** [V-gh] | none | **none** (0 tags, 0 runs) | Code yes; needs image, Identity, Control token |
| munaxa-school | `9671bcb` (#24) | CI is PR-only; PR #24 head: JS/TS and Security **success**, Flutter and Supabase Preview skipped [V-gh] | none | **none** (0 tags, workflow is dispatch-only and never run) | Code yes; needs image, DB-name decision, Resend key |
| munaxa-docs | `b8c7e25` (#174) | CI push run 41797643375 **success** [V-gh] | none | Docs ECR holds `f8a8bea` only (25 Oct), **17 first-parent commits behind** and without CONTROL_PLANE licensing or the TLS fix [V-gh, V-repo] | **No** until a fresh image; most complex product |

**Merge eligibility:** apart from this task's own documentation PRs, **no open PR exists in any of the six repositories** [V-gh `list_pull_requests` state=open, 5 Nov ~18:50 UTC]. Nothing else was eligible to merge.

**Branch protection:** platform `main` has a ruleset with required checks (#49 shows `mergeable_state: blocked` while checks run) [V-gh]. The product repositories' main and `image/*` tag rulesets and `image-release` environments were proposed in phase 7 (`05`, owner steps O-2 to O-6); **whether the owner created them is unknown** [U] (no read API for rulesets or environments in this session).

## 2. Per repository

### munaxa-identity (`5277d71`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Build and test | CI green on main | [V-gh] run 41992700652 |
| Dockerfile | `apps/api/Dockerfile`: targets `migrate` (runs `prisma migrate deploy` with `DATABASE_MIGRATION_URL`) and `runtime` (`node dist/main.js`, non-root `identity`). RDS CA bundle via `NODE_EXTRA_CA_CERTS` (#5) | [V-repo] lines 65 to 69, 111 to 154 |
| Image workflow | `publish-images-ecr.yml`: `image/**` tag, `image-release` environment, `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN`, pushes `munaxa-identity/{api,migrate}`. GHCR workflow is dispatch-only (#6) | [V-repo] |
| ECR and publisher role | Repositories and `munaxa-identity-image-publisher` created at G2 [V-prior]; trust: `environment:image-release` + `refs/tags/image/*` [V-repo `bootstrap/iam.tf` 549 to 575] | Repository variable set? [U] |
| Runtime configuration | Stack sets `NODE_ENV=production`, Valkey sidecar on 127.0.0.1:6379 (`valkey_image` required), `identity_signing_kid`, `identity_public_keys`, `TRUST_PROXY_HOPS=1` | [V-repo] `services.tf`, `variables.tf` 193 to 275 |
| Secrets (names only) | `munaxa-nonprod/identity`: `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD`. `munaxa-nonprod/identity-migrate`: `DATABASE_MIGRATION_URL`. One-run `munaxa-nonprod/identity-bootstrap`: `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` | [V-repo] `data.tf` 143 to 148, `ops.tf` |
| Migrations | Run-only `identity-migrate` task; then `identity-bootstrap` (account, Control roles), `seed-work-roles --organisation`, restart identity | [V-repo] README G7 step 3 |
| Health | `/api/auth/health/live` (container), `/api/auth/health/ready` (ALB); controller has `live` and `ready` | [V-repo] `health.controller.ts` 31, 41; `services.tf` 54, 175 |
| Auth | The issuer. Its public keys feed Work (`PLATFORM_AUTH_PUBLIC_KEYS`) and Control (`OPERATOR_AUTH_PUBLIC_KEYS`) | [V-prior] phase 7 `06` |
| Licensing | Not licensed itself (platform identity) | [V-repo] no `LICENSING_MODE` |
| Rollback | Previous digest by PR + apply; ECS circuit breaker; Testing DB drop/recreate via db-admin | [V-repo] README Rollback |
| Blockers | No image; signing key pair, kid and public keys unset; bundle values; `valkey_image` digest | §3 |

### munaxa-control (`a24c568`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Build and test | CI green on main | [V-gh] run 41122329528 |
| Dockerfile | Root `Dockerfile`: `api` (`node dist/main.js`, user `node`), `migrate` (`prisma migrate deploy` + runtime grants, pnpm offline), `portal` | [V-repo] lines 5, 73 to 87 |
| Image workflow | `publish-images.yml` → ECR `munaxa-control/{api,migrate,portal}`, `image/**` tag, `image-release` | [V-repo] |
| Runtime configuration | `LICENCE_SIGNING_BACKEND=KMS` (ADR-0008); needs `control_licence_public_key` (P-256 SPKI PEM read from the KMS key after it exists), `control_licence_kid`, `control_operator_organisation_id`, `control_operator_subjects`, `identity_public_keys`; Terraform refuses control-api above 0 tasks until set. Portal: `operator_access` (Cloudflare Access team domain and AUD) required before any Control digest | [V-repo] `variables.tf` 141 to 150, 304 to 313 |
| Secrets | `munaxa-nonprod/control-api`: `DATABASE_URL`; `munaxa-nonprod/control-migrate`: `DATABASE_MIGRATION_URL`. No signing key secret (KMS) | [V-repo] `data.tf` 144, 146 |
| Migrations | Run-only `control-migrate`; sweep task `node dist/sweep.js` | [V-repo] `services.tf` 371 to 391, 460 |
| Health | API `/health/live`, `/health/ready`; portal `/healthz` (middleware excludes it from Access check) | [V-repo] |
| Auth | Operator tokens from Identity; Cloudflare Access in front of the operator host; public API surface limited to `/api/v1/products/*`, `/api/v1/licensing/*`, `/health/*` (ALB) | [V-repo] `services.tf` 361 |
| Licensing | The licence source for Work, School, Docs | ADR-0008 |
| Blockers | No image; Cloudflare Access app not created [U]; two-step licence-key bring-up; operator org and subjects from Identity's first run | §3 |

### munaxa-work (`b490b25`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Build and test | PR #29 checks 4/4 green (Standards, Mobile, Product isolation, Lint/Typecheck/Test/Build) | [V-gh] |
| Dockerfiles | `apps/api/Dockerfile` `migrate` (`prisma migrate deploy` + `deploy/aws/runtime-grants.sql`) and `runtime`; `apps/admin/Dockerfile` (Next.js, port 3001, user `admin`). RDS CA bundle vendored (#28) | [V-repo] |
| Image workflow | `publish-images-ecr.yml` → `munaxa-work/{api,migrate,admin}`; GHCR dispatch-only (#29) | [V-repo] |
| Runtime configuration | `LICENSING_MODE=CONTROL_PLANE`, `CONTROL_PLANE_URL` = Control API host, `OPENAPI_ENABLED=false`, `PLATFORM_AUTH_*` from Identity | [V-repo] `services.tf` 537 to 538 |
| Secrets | `munaxa-nonprod/work-api`: `DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN` (≥ 20 chars; placeholder until Control issues `mxc_`). `munaxa-nonprod/work-migrate`: `DATABASE_MIGRATION_URL` | [V-repo] `data.tf` 149 |
| Migrations | Run-only `work-migrate`; tenant bootstrap through a `work-migrate` command override (`bootstrap-tenant.mjs`) | [V-prior] phase 7 `06` step 12.9 |
| Health | `/health/live`, `/health/ready`; admin ALB check `/` | [V-repo] spec and `services.tf` 552, 589 |
| Auth | Every authenticated route needs Identity tokens; users need Identity roles from `seed-work-roles` and a role assignment (`bootstrap-account --role`, F-3) | [V-prior] phase 7 `06` F-3 |
| Licensing | Production refuses `NONE`, set or defaulted; `CONTROL_PLANE_URL` must be https in production | [V-repo] `packages/config/src/licensing.ts` 53 to 60, 124 to 127 |
| Blockers | No image; Identity and Control must run first; real `CONTROL_PLANE_TOKEN` after Control step 4 | §3 |

### munaxa-school (`9671bcb`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Build and test | PR #24: JS/TS and Security green; Flutter skipped (no change); "Supabase Preview" skipped | [V-gh] |
| Dockerfiles | `apps/api/Dockerfile` `migrate` (`prisma migrate deploy` + `infra/postgres/runtime-grants.sql`) and `runtime`; `apps/admin/Dockerfile` (Next.js standalone) | [V-repo] |
| Image workflow | `publish-images-ecr.yml` is **`workflow_dispatch` only**, refuses any ref that is not an `image/<sha>` tag; admin built per environment (`-nonprod`, `-prod`) | [V-repo] lines 27 to 28, 73 to 78, 114 to 133 |
| Runtime configuration | `LICENSING_MODE=CONTROL_PLANE`; S3 file bucket (`AWS_S3_BUCKET`, stack `storage.tf`) | [V-repo] `services.tf` 632 |
| Secrets | `munaxa-nonprod/school-api`: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different), `CONTROL_PLANE_TOKEN` (≥ 20), `RESEND_API_KEY`. `munaxa-nonprod/school-migrate`: `DATABASE_MIGRATION_URL`. One-run `munaxa-nonprod/school-bootstrap`: `PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_PASSWORD` | [V-repo] `data.tf` 150; README G7 |
| Migrations | Run-only `school-migrate`, then `school-bootstrap` (seeds + platform owner) | [V-repo] `ops.tf` 295 to 383 |
| Health | `/api/v1/health/live`, `/api/v1/health/ready`; admin `/login` | [V-repo] |
| Auth | Own JWT auth (not Identity) | [V-repo] env validation |
| Licensing | Production refuses `DATABASE` (permissive), set or defaulted | [V-repo] `env.validation.ts` 125 to 139 |
| Open decision | Database name: School docs say `school_db`, CONTRACT §6 says `school`; `db-bootstrap.sh` refuses two names | [V-prior] phase 7 `06` S-3 |
| Blockers | No image; DB name; Resend key | §3 |

### munaxa-docs (`b8c7e25`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Build and test | CI green on main | [V-gh] run 41797643375 |
| Dockerfile | `api`, `web` (distroless-style `runtime`, `dumb-init`, user `node`), `worker`; `infra/antivirus/Dockerfile` (c-icap + ClamAV) | [V-repo] |
| Image workflow | `publish-images.yml`: `image/**` tag, `image-release`, publisher role **from the Docs bootstrap** (`munaxa-docs/bootstrap/munaxa-docs-eu-prod-image-publisher`, hard-coded line 58), release-smoke job with no AWS access | [V-repo] |
| Registry | `munaxa-docs/{api,web,antivirus}` in the Docs bootstrap; the shared boundary admits pulls from `munaxa-docs/*`. Existence after the eu-prod retirement: [U] (reported kept) | [V-prior] retirement report |
| Runtime configuration | `LICENSING_MODE=CONTROL_PLANE`, outbound allow-list starting with the Control host, Redis sidecar, scanner on Cloud Map | [V-repo] `docs.tf` 46 to 72 |
| Secrets | `munaxa-nonprod/docs-api`: `DATABASE_URL`, `TENANT_CATALOGUE`, `REDIS_URL`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `SIGNATURE_WITNESS_SECRET`, `AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`, `METRICS_SCRAPE_TOKEN`, `MAIL_RESEND_API_KEY`, `CONTROL_PLANE_TOKEN` (≥ 32). `munaxa-nonprod/docs-operator`: `EDMS_OWNER_PASSWORD`, `EDMS_APP_PASSWORD`, `EDMS_BACKUP_PASSWORD`. One-run `munaxa-nonprod/docs-provision/<slug>`: `TENANT_ID`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | [V-repo] `docs.tf` 32 to 38 |
| Migrations | `docs-db-admin` (cluster roles, tenant DB, refuses if `edms_backup` can reach a non-Docs DB), then `docs-provision` | [V-repo] README G7 step 3 |
| Health | `/api/health/live` (container and ALB), web `/login`, scanner ICAP probe (300 s start period) | [V-repo] `docs.tf` 145, 171, 212, 239 |
| Licensing | Production refuses `NONE` (#163) | [V-repo] `configuration.ts` 980 to 988 |
| Blockers | Stale image; three images plus Redis and postgres digests; 14 secret keys; heaviest per-hour cost | §3 |

### munaxa-platform (`016f3f5`)

| Item | Finding | Evidence |
| --- | --- | --- |
| Terraform | `bootstrap/` applied; `stack/` not applied; mocked plan tests green on PR #49 | [V-gh]; `02` |
| Workflows | `aws-terraform.yml` (plan → reviewed saved-plan apply, `aws-nonprod`/`aws-prod` approvals; apply job refuses another commit or a plan older than 4 h); `aws-session.yml` (`up`/`down`, nightly `down`, session plan checks for network placement and SG rules, DB stop on `!success()`) | [V-repo] |
| Open items | README G7 ordering F-1 to F-4 not yet fixed (phase 7 follow-up); review L-1 to L-3 need a bootstrap re-apply; B2 unresolved | [V-prior] phase 7 `09`; evidence recovery |

## 3. Blockers by repository (summary; detail in `04`)

| Repository | Blocking the first session | Owner |
| --- | --- | --- |
| platform | G3 approval and apply; G6 DNS; backstop apply and verification; B2 decision; F-1/F-2 runbook fixes (code) | Owner (approvals), lead (code) |
| identity | Image (G5); key pair; bundle values (G4); `valkey_image` | Owner |
| control | Image; Cloudflare Access app (AUD, team domain); licence public key two-step; operator org and subjects | Owner, lead (PRs) |
| work | Image; real `CONTROL_PLANE_TOKEN` after Control | Owner |
| school | Image; DB name; Resend key | Owner |
| docs | Fresh image (17 commits behind); publisher role present? | Owner |
