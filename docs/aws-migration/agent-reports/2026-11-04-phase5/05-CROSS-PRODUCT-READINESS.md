# 05 Cross-product deployment readiness (Phase 5, Agent 5)

Date: 2026-11-04 (UTC). Scope: munaxa-identity, -control, -work, -school, -docs against munaxa-platform
`infra/aws/CONTRACT.md` and `infra/aws/stack/*.tf` at platform `origin/main` 00667f31493b (#36).
No AWS credentials or AWS MCP were used. No workflows were dispatched, no images published, no secrets written.
Evidence: `phase5/evidence/05/`.

## Summary table

| Product | Main HEAD | CI on main code | Open PRs (before) | Readiness |
| --- | --- | --- | --- | --- |
| Identity | b97b3abc9d3a (#4) | CI push run 41071826393 success [V] | none [V] | **Blocked until identity#5 merges** (bootstrap scripts cannot reach RDS over TLS); Ready with caveats once it merges |
| Control | a24c5681f0ca (#7) | CI push run 41122329528 success [V] | none [V] | **Ready with caveats** (startup needs operator_access, the licence key's public half, the operator org and subjects, and Identity keys set first) |
| Work | da84612ed018 (merge of #27) | CI is PR-only; PR #27 head f33da25 run 41065851607 success [V] | none [V] | **Blocked until work#28 merges** (API cannot connect to RDS over TLS); Ready with caveats once it merges |
| School | 54cf3eb7b0e0 (#23, squash) | CI is PR-only; PR #23 head e08193b run 41069902465 success [V] | none [V] | **Ready with caveats** |
| Docs | b8c7e252bb62 (#174) | CI push run 41797643375 success [V] | none [V] | **Ready with caveats** (needs a fresh image publish from main) |

Evidence: `ci-and-prs.txt`, `main-head-runs.txt`, `publish-runs.txt`.

## PRs created

| Repo | PR | Head SHA | CI (at report time) |
| --- | --- | --- | --- |
| munaxa-identity | #5 "Trust the Amazon RDS roots so the bootstrap scripts reach RDS" | 92fdf97f00ea739f4c91bf27631bcb67d451af43 | `verify` success (includes the integration suite with the new test) [V] |
| munaxa-work | #28 "Trust the Amazon RDS roots so the API can connect to RDS" | 246edc5ee59182fa70ca40d72e62803c390671b0 | run 41818706797: all 4 jobs success (Lint · Typecheck · Test · Build completed 11:20:50Z) [V] (`pr-ci.txt`) |

Neither PR is merged. Both are code-only changes, and neither touches a workflow.
How the branch was set up: the shared checkouts already had a local branch `claude/project-thread-m3u6s9` at main HEAD.
That branch was checked out there, so I committed on the private local branch `a5/rds-ca` and pushed `HEAD:refs/heads/claude/project-thread-m3u6s9`.
The remote branch did not exist before, so this push created it and was not a force-push.

## Key finding: node-postgres + `sslmode=require` + RDS = TLS failure (fixed by PR)

- [V] The contract (§6) gives every URL `?sslmode=require`, and RDS runs with `rds.force_ssl=1` (data.tf).
- [V] pg-connection-string 2.14.0 (in the Identity and Work lockfiles) maps `require` to an empty `ssl` object, which means verification.
  It prints "SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'" (`evidence/05/pg-connection-string-2.14.0-index.js`, lines 77-79 and 139-151).
- [V] Reproduction (`pg-sslmode-require-demo.txt`): pg 8.22.0, `sslmode=require`, server certificate from a private root.
  - Without the root: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
  - With `NODE_EXTRA_CA_CERTS`: the handshake succeeds.
- [V] The RDS eu-central-1 roots are not in Node's `tls.rootCertificates`. The new tests assert this.
- What it breaks:
  - Work API runtime: the `pg.Pool` in database.module.ts, plus the startup isolation check, so the API never becomes ready.
  - Work `bootstrap-tenant.mjs` in the migrate image.
  - Identity `bootstrap-account.mjs`, `seed-control-roles.mjs` and `seed-work-roles.mjs` in the identity-bootstrap task.
- [E] Not affected:
  - Everything that uses only Prisma 6.19.3. The Prisma engine defaults to `sslaccept=accept_invalid_certs`, from the Prisma docs; I did not test this here. That covers Control, School, Docs, the Identity runtime and all `migrate` targets.
  - psql/libpq tasks (db-admin, docs-db-admin), where `require` means no verification.
  - Docs Production ran on RDS with force_ssl and Prisma, which supports this.
- The fix in both PRs:
  - Vendor AWS's eu-central-1 bundle (sha256 `56a0cae0...4d8b84`, three roots, from truststore.pki.rds.amazonaws.com).
  - Set `NODE_EXTRA_CA_CERTS` in the image. Verification stays on.
  - Tests pin the root fingerprints and the Dockerfile wiring.
- [O] With verify-full, the host in DATABASE_URL and DATABASE_MIGRATION_URL must be the RDS endpoint DNS name, never an IP address.

## Per product

### Identity
- [V] Dockerfile `apps/api/Dockerfile`:
  - Targets `runtime` (user `identity`) and `migrate` (user `migrate`, runs `prisma migrate deploy` with DATABASE_MIGRATION_URL).
  - Base image `node:22-alpine`, not pinned by digest. [R] Pin it later; this does not block.
- [V] The publish workflow `publish-images-ecr.yml`:
  - Triggered by an `image/**` tag push. Checks that the tag names the commit and that the commit is on main.
  - Jobs run in the `image-release` environment. Uses role variable `AWS_IMAGE_PUBLISHER_ROLE_ARN`.
  - Targets repos `munaxa-identity/api` and `munaxa-identity/migrate`, which match bootstrap `image_repositories`.
  - Tags are `<short>` and `sha-<full>`; the stack uses digests only.
  - It sets no `platforms:`, so it builds for the ubuntu-latest runner, which is amd64 [E]. Tasks are X86_64 by module default [V].
- [U] The variable's value and the environment's reviewers: those APIs return 403 here.
  The expected value is `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-identity-image-publisher`.
- [V] Health endpoints match the stack: `/api/auth/health/ready` (ALB) and `/api/auth/health/live` (container), port 4001, under global prefix `api` with controller `auth/health`.
- [V] Environment and bundle keys match the config schema. REDIS_URL is required in production.
- [O] `valkey_image` is unset in nonprod.tfvars. Without the Valkey sidecar, `REDIS_URL=redis://...@127.0.0.1:6379` has nothing to connect to.
  It must be set (and so must `postgres_image` for db-admin) before a session. Both are platform tfvars.
- [O] Work roles: `docs/runbooks/aws.md` covers only the Control roles. Work also needs `node scripts/seed-work-roles.mjs --organisation <slug>`, run as an identity-bootstrap command override.
  Without it, Work members get 403. The platform runbook G7 does not mention this step.

### Control
- [V] The Dockerfile base is pinned by digest (`node:22-bookworm-slim@sha256:de170b...`).
  - Targets `api`, `migrate` and `portal` all run as user `node`.
  - `migrate` runs `prisma migrate deploy`, then `infra/sql/grants.sql` (control_app).
- [V] The publish workflow `publish-images.yml`:
  - Tag-triggered, `image-release` environment, `AWS_IMAGE_PUBLISHER_ROLE_ARN`.
  - Repos `munaxa-control/{api,migrate,portal}` match bootstrap.
  - No non-root check step, unlike Identity, Work and School. [R]
- [V] Health endpoints `/health/live` and `/health/ready` are excluded from the `api/v1` prefix. The portal serves `/healthz`, which its middleware matcher excludes.
- [V] KMS (ADR-0008):
  - `LICENCE_SIGNING_BACKEND=KMS`, KMS key ARN, ES256 only.
  - The region is parsed from the key ARN.
  - The task role has `kms:Sign` only.
- [V] The config refuses to start in production unless all of these are set:
  - `OPERATOR_ACCESS_TEAM_DOMAIN` and `OPERATOR_ACCESS_AUDIENCE` (stack: only when `operator_access` is set);
  - a non-empty `OPERATOR_SUBJECT_ALLOWLIST` and `OPERATOR_ORGANISATION_ID`;
  - a non-empty `OPERATOR_AUTH_PUBLIC_KEYS`;
  - a valid `LICENCE_SIGNING_PUBLIC_KEY` and `LICENCE_SIGNING_KID`.
  The portal also refuses without Access.
- [O]/[R] for the platform runbook: the first session needs a two-step apply.
  1. With the Control images set and services off, the KMS key is created.
  2. Read its public half. Run Identity steps 1 to 3 to get the organisation id and subjects. Set `identity_public_keys`, `operator_access`, `control_licence_*` and `control_operator_*` by PR.
  3. Then bring the services up.
  In G7 as written, step 1 brings services up before step 4. control-api would crash-loop until the circuit breaker gives up.
- Work, School and Docs need `CONTROL_PLANE_TOKEN` from the portal. The bundle key must exist before the task starts, because ECS secret injection fails on a missing key.
  [R] Write an interim value, or keep those services off until the tokens are issued. Work requires the value to be at least 20 characters.

### Work
- [V] Dockerfiles:
  - `apps/api/Dockerfile`: `runtime` (user `work`) and `migrate` (`prisma migrate deploy`, then `deploy/aws/runtime-grants.sql`).
  - `apps/admin/Dockerfile`: `runtime` (user `admin`, `next start` on 3001).
  - Bases are `node:22-alpine`, not digest-pinned. [R]
- [V] The publish workflow `publish-images-ecr.yml`: tag-triggered, `image-release`, repos `munaxa-work/{api,migrate,admin}` match bootstrap.
- [V] Health endpoints: `/health/ready` and `/health/live` are excluded from prefix and versioning. Routes are `/api/v1/*` (prefix `api`, URI versioning v1). Admin `/` answers below 500.
- [V] Database:
  - The `btree_gist` extension is a trusted extension; the database owner can create it [E].
  - The migration creates role `work_membership_resolver`; db-bootstrap grants the owner CREATEROLE.
- [V] The admin reads `WORK_API_URL` and `PLATFORM_SIGN_IN_URL` on the server side (`next/headers`).
- **Blocker, fixed by work#28.**
- [O] For the first tenant, follow `deploy/aws/README.md`: a work-migrate override running `bootstrap-tenant.mjs`, then a Control tenant link and Identity roles.

### School
- [V] `apps/api/Dockerfile` targets `runtime` (user `nestjs`) and `migrate` (user `migrate`).
  - `migrate` runs migrate deploy, then `infra/postgres/runtime-grants.sql` (munaxa_app).
  - The admin is Next standalone (user `nextjs`). Bases are not digest-pinned. [R]
- [V] The publish workflow `publish-images-ecr.yml`:
  - Dispatch-only, run from an `image/<sha>` tag, with a `production-gate` job and the `image-release` environment.
  - Repos `munaxa-school/{api,migrate,admin}`.
  - The admin is built twice, with tags `-nonprod` (`NEXT_PUBLIC_API_URL=https://school.test.munaxa.com/api/v1`) and `-prod`.
- [V] Health endpoints: `/api/v1/health/{ready,live}` on port 4000. The admin serves `/login` on 3000.
- [V] There are 92 migrations, with no extensions and no Supabase roles. munaxa_app grants are guarded by `IF EXISTS`.
  The school-bootstrap task's `tsx`, `prisma/seed.ts` and `scripts/seed-platform-owner.ts` are all present in the migrate image.
- [O] Naming: School's `docs/ops/aws.md` names the database `school_db`; CONTRACT §6 says `school`.
  db-bootstrap takes the name from the URLs, so either works, as long as both bundles use the same name.
- [V] The old "Deploy" runs on main (40861985353 and others, 29 Oct) failed at "Apply database migrations". They were Render/GHCR runs, and the workflow is now dispatch-only. Not relevant to AWS.

### Docs
- [V] Dockerfile:
  - `api` and `web` targets come from a `scratch` runtime, user `node`. The antivirus image is `ubuntu:24.04`, user 101:102.
  - Bases are not digest-pinned. The scanner's packages are unpinned, which its publish job compensates for with probe acceptance.
- [V] The publish workflow `publish-images.yml`:
  - Tag-triggered, `image-release`.
  - The role is hard-coded as `role/munaxa-docs/bootstrap/munaxa-docs-eu-prod-image-publisher`, from the retained Docs bootstrap.
  - Repos `munaxa-docs/{api,web,antivirus}` match CONTRACT §2.
- [V] The last publish was f8a8bea (run 40225272398, 25 Oct). It is 17 commits behind main and predates #160 and #163 (CONTROL_PLANE licensing; production refuses NONE).
  [O] Publish fresh images from main before the session.
- [V] Health endpoints: `/api/health/live` (global prefix `api`) and web `/login`.
- [V] The stack env and secret keys mirror the retired eu-prod service (recovered from git, 1f47ba4^).
- [V] `scripts/docs-cluster-roles.sql` is identical to Docs `infra/sql/cluster/01-roles.sql`, ignoring comments.
- [V] The bucket is `munaxa-nonprod-docs-files-229251310592`. The tenant DB `edms_munaxa_internal` is created empty.
- [V] No code path assumes eu-prod. Only the `JWT_ISSUER` default is `https://docs.munaxa.com`, which Docs both issues and verifies itself (cosmetic). [R] Optionally set it per environment.
- [V] The scanner reaches ClamAV mirrors over 443 egress through its public IP.
- [O] The owner writes the `TENANT_CATALOGUE`, `docs-operator` and `docs-provision/<slug>` values.

## Platform changes needed (for the lead; I did not touch munaxa-platform)
1. Runbook G7: add the two-step Control bring-up (above) and Identity `seed-work-roles.mjs`. Write the CONTROL_PLANE_TOKEN key before the services start.
2. nonprod.tfvars: set `valkey_image` and `postgres_image` by digest, and `identity_public_keys`, `identity_signing_kid`, `operator_access`, `control_*` before Control or Work start.
3. CONTRACT §6/§8: state that DATABASE_URL hosts must be the RDS endpoint name (verify-full with node-postgres).
   Optionally reword "Image tag = the commit sha" to the actual `<short>`/`sha-<full>` tags.

## Not verified
- [U] GitHub environment `image-release` protection rules and repository variables (API 403).
- [U] Whether ECR repositories and publisher roles exist in AWS (no AWS access).
- [U] Full product test suites for the PRs were not run locally (private packages). PR CI is the check.
