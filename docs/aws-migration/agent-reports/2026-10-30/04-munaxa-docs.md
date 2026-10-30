# Agent 4: munaxa Docs, AWS Testing readiness report

- **Report date:** 2026-10-30. Refreshed at about 15:30 UTC against the live repositories.
- **Agent:** Agent 4 (Docs).
- **Repository owned:** `munaxa/munaxa-docs`.
- **Also read (no changes made):** `munaxa/munaxa-platform` (shared stack, #26), `munaxa/munaxa-identity`
  and `munaxa/munaxa-control`, to check the integration contracts.
- **Branch:** `claude/project-thread-rs73yv`.

Labels used in this report:

- **[V] Verified.** Read from the repository, the GitHub API or CI at the stated SHA or run.
- **[A] Assumption.** Not checked against a live system.
- **[R] Recommendation.**

---

## 1. Scope and repository inspected

Scope came from the kickoff (Agent 4). The Docs-side tasks were:

- Audit the merged AWS migration work.
- Review the Dockerfile, ECS shape, database, storage, migrations, health checks and the image workflow.
- Verify Control Plane licensing and Identity integration.
- List the infrastructure and environment variables Docs needs.
- Fix code gaps with PRs.

Hard boundaries: do not touch the existing Docs AWS stack, and make no apply, AWS, secret, Cloudflare
or Render change, no image publication, no deploy and no remote migration.

| Repository | Ref inspected | Why |
| --- | --- | --- |
| munaxa/munaxa-docs | `main` @ `406eaeed797ba54fb9d51fbfab3e1b4cce823e86` (re-checked 15:30 UTC, unchanged) | Owned |
| munaxa/munaxa-platform | `main` @ `c4a1ad0` (#26 merged 30 Oct, 14:39 UTC) | Docs' Testing home (`infra/aws/stack/docs.tf`, `infra/aws/CONTRACT.md`) |
| munaxa/munaxa-identity | `main` @ `44c9f49` | Can Docs federate to Identity? |
| munaxa/munaxa-control | `main` @ `fc59515`, then the latest `origin/main` at audit time | Does Control serve the Docs licensing contract? |

## 2. Current implementation status

| Item | Status | Evidence |
| --- | --- | --- |
| Docs application code for Testing | **Ready** [V] | `main` 406eaee; CI run [41033592125](https://github.com/munaxa/munaxa-docs/actions/runs/41033592125), push, conclusion `success` |
| Licensing through Control (`CONTROL_PLANE`) | **Implemented** [V] | #162, #163, #164, #165 and #166 are merged. See section 4 |
| Docs in the shared Testing stack | **Implemented as code, not applied** [V] | platform #26 → `c4a1ad0`, `infra/aws/stack/docs.tf` (491 lines). Cross-checked against Docs in section 4.3 |
| Image publish workflow fix and action pinning | **PR #167 open, green on push CI, not merged** [V] | Section 5 |
| Release image usable on Testing | **No.** A new image release is needed [V] | Section 7, B-2 |
| Identity SSO for Docs | **Not possible today.** Docs keeps its own sign-in [V] | Section 4.2 |

## 3. Files and components reviewed

munaxa-docs, all at `406eaee`:

- `Dockerfile`: targets `api`, `web` and `worker`, plus the runtime bases.
- `.github/workflows/ci.yml`, `publish-images.yml` and `terraform-eu-prod.yml`.
- `infra/terraform/README.md`, `eu-prod/service/{ecs,ops,secrets,edge,launch.auto,release.auto}.tf(vars)`.
  These are the existing Production stack, read only.
- `infra/sql/cluster/01-roles.sql`, `infra/sql/database/`, `infra/sql/post-migrate/`,
  `scripts/migrate-tenants.mjs` and `scripts/apply-post-migrate.mjs`.
- `apps/api/src/core/config/configuration.ts`: every environment-variable name the API reads.
- `apps/api/src/core/licensing/control-plane.lookup.ts` and `usage-lane.consumer.ts`.
- `apps/api/src/provision.ts`, `apps/web/server.mjs`, `apps/web/next.config.ts` and
  `apps/web/src/app/(auth)/login`.
- `infra/antivirus/Dockerfile`.

munaxa-platform at `c4a1ad0`: `infra/aws/CONTRACT.md`, `stack/docs.tf`, `stack/network.tf`
(S3 endpoint), `stack/scripts/docs-cluster-roles.sql`, `stack/envs/nonprod.tfvars`, and
`modules/service/main.tf` (egress).

munaxa-identity at `44c9f49`: `apps/api/src/auth/auth.controller.ts` and `health/health.controller.ts`.

munaxa-control: `apps/api/src/entitlements/products.controller.ts` and `apps/api/src/core/products.ts`.

## 4. Audit findings

### 4.1 Docs application and images [V]

| Area | Finding | Source |
| --- | --- | --- |
| Images | `api` and `web` are built on a `scratch` base: Debian 12 libraries only, no shell, no package manager, no setuid binaries, uid 1000. A read-only root filesystem is supported. `worker` is not part of the release. The npm credential is a BuildKit secret, not a build argument. | `Dockerfile` |
| Health | API liveness `GET /api/health/live` touches no dependency, by design. The web has no image HEALTHCHECK; Production uses an ALB check on `/login`. | `Dockerfile`, `eu-prod/service/edge.tf:55,75` |
| Database | Docs is database per tenant (ADR-0015). It has cluster-wide roles `edms_owner` (owns the schema, runs migrations) and `edms_app` (`NOBYPASSRLS`, `statement_timeout` 15s), plus `edms_backup` for dumps. Each tenant database is listed in `TENANT_CATALOGUE`. | `infra/sql/cluster/01-roles.sql`, `docs/operations/backup-and-restore.md` |
| Migrations | They run only in the one-off provisioning task (`provision.js`, `DEPLOYMENT_PROFILE=ON_PREMISE`, `QUEUE_CONSUMERS_ENABLED=false`) as `edms_owner`. Nothing migrates when a service starts. | `eu-prod/service/ops.tf:141-201` |
| Storage | S3 with task-role credentials (`STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE`). | `eu-prod/service/ecs.tf` |
| Redis | A sidecar in the API task, with its password from the application bundle. | `ecs.tf:236-255` |
| Antivirus | ClamAV through c-icap, reached over Cloud Map at `:1344/avscan`. The health check runs `c-icap-client` against a probe file. | `ecs.tf:259-289`, `infra/antivirus/Dockerfile` |
| Mail | `MAIL_DRIVER=RESEND`, sender `docs@notify.munaxa.com`. The domain must be verified in Resend. | `launch.auto.tfvars` |

### 4.2 Integration with Control and Identity [V]

- **Control:** Docs calls `entitlementsPath('docs', tenantId)` and `usagePath('docs')` from
  `@munaxa/licensing` (`control-plane.lookup.ts:30` and `usage-lane.consumer.ts:120`). Control's
  `products.controller.ts` serves that contract and names Docs' `ControlPlaneLookup` as its client.
  Production refuses `LICENSING_MODE=NONE` (#163). The Control host must be on
  `OUTBOUND_HTTP_ALLOWLIST`. Outbound TLS is now verified by hostname (#164), and requests carry
  `User-Agent: munaxa-docs` (#166).
- **Identity:** Munaxa Identity exposes only `/auth/login|refresh|logout|session` and
  `/auth/health/{live,ready}`. It has no OIDC discovery, authorize or JWKS endpoint, so Docs' per-tenant
  OIDC/SAML federation can't use it. For Testing, Docs uses its own sign-in (`JWT_ACCESS_SECRET`, MFA).
  `CONTRACT.md` records the same decision. SSO is a later phase.

### 4.3 Cross-check of platform #26 (`docs.tf`) against Docs [V]

Platform #26 implemented the requirements from this agent's first report. Each line below was compared with Docs Production and the Docs code.

| Docs requirement | Platform #26 | Match |
| --- | --- | --- |
| Host `docs.test.munaxa.com`, `/api/v1/preview/stream*` routed to the api, everything else to the web, ALB idle timeout 120 s | `nonprod.tfvars:18`, `edge.tf`, `CONTRACT.md:28` | Yes |
| docs-api 512/2048 with a Redis sidecar, health `/api/health/live` | `docs.tf:107-178` | Yes |
| API environment-variable names and values | `docs.tf:49-73` | Same 24 names as Production `ecs.tf`; `CONTROL_PLANE_URL` is `https://control-api.test.munaxa.com` |
| docs-web 256/1024, `NEXT_PUBLIC_API_URL` set to the internal API, ALB check `/login` | `docs.tf:180-212` | Yes. The `/login` route exists (`apps/web/src/app/(auth)/login`) |
| docs-scanner 256/2048, Cloud Map, c-icap health check, 300 s start | `docs.tf:215-238` | Same command as Production `ecs.tf:282` |
| Egress for Control, Resend, ClamAV mirrors and ECR | The module allows 443 to `0.0.0.0/0` (`modules/service/main.tf:148-150`); api reaches scanner on 1344 and web reaches api on 3001 | Yes |
| Bucket `munaxa-<env>-docs-files-<account>` and a task-role policy for it | `storage.tf`; the S3 endpoint `OwnFileBuckets` statement | Yes |
| Cluster roles plus the tenant database | `docs-db-admin` with `scripts/docs-cluster-roles.sql` | Yes, a copy of Docs `01-roles.sql` (see F-3) |
| Provisioning | `docs.tf:378-463` runs `provision.js` with `ON_PREMISE` and consumers off, using the one-run secret `docs-provision/<slug>` | Same as Production `ops.tf` |
| Secret bundle keys | `CONTRACT.md:110-113` | Same 11 keys as Docs `secrets.tf`; an operator bundle for the `EDMS_*` passwords |
| Pulling from the existing `munaxa-docs/*` ECR | The boundary allows only the three pull actions on `munaxa-docs/*` and still denies `munaxa-docs*` secrets and S3 | Yes. This resolves review R-01 |
| On-demand only | `services_enabled`/`edge_enabled` | Yes |
| `images = {}` | `nonprod.tfvars:51` | **Open.** It needs new digests (B-2) |

## 5. Work completed (PRs, branches, SHAs)

| PR | Branch | Commits | Status | CI evidence |
| --- | --- | --- | --- | --- |
| [munaxa-docs#167](https://github.com/munaxa/munaxa-docs/pull/167): "Publish images: platform package token, and every action pinned by SHA" | `claude/project-thread-rs73yv` | `6f0ea798` (token fix), `a53852d3` (SHA pinning, review R-07b) | **Open, not merged** | `6f0ea79`: push run [41044058200](https://github.com/munaxa/munaxa-docs/actions/runs/41044058200) success; pull_request run [41044081583](https://github.com/munaxa/munaxa-docs/actions/runs/41044081583) success (all 11 checks). `a53852d`: push run [41071431614](https://github.com/munaxa/munaxa-docs/actions/runs/41071431614) success. **No pull_request run exists for `a53852d`** (see B-1) |

What #167 changes. It touches one file, `.github/workflows/publish-images.yml`.

- **Package token (`6f0ea79`).** The image build secret and the release-smoke `pnpm install`
  used `GITHUB_TOKEN` only. #162 had moved every `ci.yml` install to
  `PLATFORM_PACKAGES_TOKEN || GITHUB_TOKEN` because `GITHUB_TOKEN` gets `ERR_PNPM_FETCH_403` on
  `@munaxa/*`. Without this fix, the next release (the first to contain `@munaxa/licensing`) would
  fail at install. [V: `publish-images.yml:150,604` before the change; `ci.yml:84-88`]
- **SHA pinning (`a53852d`).** All 22 tag-pinned `uses:` lines are now pinned to the commit each tag
  resolved to on 2026-10-30, with `git ls-remote` and the peeled tag:
  - `actions/checkout` v6.1.0 `d23441a4`
  - `docker/setup-buildx-action` v3.12.0 `8d2750c6`
  - `docker/build-push-action` v6.19.2 `10e90e36`
  - `actions/upload-artifact` v4.6.2 `ea165f8d`
  - `actions/download-artifact` v4.3.0 `d3f86a10`
  - `actions/setup-node` v6.5.0 `24997072`
  - `actions/cache` v5.1.0 `caa29612`
  - `actions/setup-go` v6.5.0 `924ae3a1`
  - `pnpm/action-setup` v6.0.10 `0977fd99`

  `aws-actions/configure-aws-credentials` was already pinned. Local checks: Prettier `--check`
  passes and the YAML parses.
- **Side effects of merging:** none. The workflow still runs only on an `image/**` tag, behind the
  `image-release` environment (required reviewer).

Other work done:

- Re-verified merges #163 (`9445afc`), #164 (`00a22be`), #165 (`a0ae491`) and #166 (`406eaee`); each
  has a green push CI run on `main` (41002695479, 41001586641, 41028597673 and 41033592125).
- Wrote Docs' requirements for the shared stack. Platform #26 implemented them, and section 4.3
  cross-checks the result.
- Messaged the lead the Identity finding (no OIDC provider).

## 6. Work still in progress

- **Merging #167** is blocked by B-1. Re-checked at 18:44 UTC: the PR head is still `6f0ea79`. Agent 4 has
  stopped polling. The merge will go through under the standing rule once GitHub syncs the PR and the
  pull_request checks are green on `a53852d`. That needs the owner's "Update branch" or a new event on the PR.

## 7. Blockers and owners

| ID | Blocker | Owner | Detail |
| --- | --- | --- | --- |
| B-1 | GitHub hasn't synced PR #167 to its branch head | GitHub / Tamer | The branch is at `a53852d` (verified with `git ls-remote`), but the PR API still reports head `6f0ea79` (last checked 18:44 UTC, still stale about 4 h 20 min after the push). Merge attempts: three on `6f0ea79` returned **HTTP 500**; one with `expectedHeadSha a53852d` returned **409 "Head branch was modified"**. No empty commit, close/reopen or bypass was used. **Tamer:** if it's still stuck, press "Update branch" on the PR or check githubstatus.com. |
| B-2 | No usable Docs image for Testing | Tamer (image-release approval), after #167 | The pinned digests are release `f8a8bea` (25 Oct), which predates #162-#166. That image would ignore `LICENSING_MODE=CONTROL_PLANE` and run unlicensed. Push tag `image/<main sha after #167>`, approve `image-release`, then set `images.docs_{api,web,antivirus}` in platform `nonprod.tfvars` with a reviewed PR. |
| B-3 | Control must be running on Testing, with a Docs credential | Agent 2 / Tamer | Production Docs refuses to boot without a licence source. Control must issue a Docs deployment credential (`mxc_…`), which the owner writes to the bundle as `CONTROL_PLANE_TOKEN`. |
| B-4 | Resend domain `notify.munaxa.com` | Tamer | Mail must be verified before invitations or reset mail can work. Not needed just to boot. |
| B-5 | Identity is not an OIDC provider | Agent 3 / Tamer (later phase) | There is no Identity SSO for Docs, Work or School. Each keeps its own sign-in for Testing. |

## 8. Infrastructure dependencies [V]

- Shared stack (platform `c4a1ad0`): VPC, public subnets, ALB with `*.test.munaxa.com`, the ECS
  cluster, the Cloud Map namespace, RDS PostgreSQL 16 (shared, with Docs as database per tenant), the
  data KMS key, the Docs bucket and the S3 gateway endpoint.
- Docs bootstrap, already applied in 229251310592: ECR `munaxa-docs/{api,web,antivirus}` and the
  image publisher role (OIDC, `image-release`).
- Order within a session (`CONTRACT.md:132-134`): `db-admin` → `docs-db-admin` → … →
  `docs-provision`, then the services.
- DNS: `docs.test.munaxa.com` in Cloudflare, DNS only (second level, so it isn't proxied). This is an
  owner action.
- Runtime: Control at `control-api.test.munaxa.com`, Resend, and the ClamAV mirrors (443).

## 9. Required environment variables (names only)

**docs-api, plain environment (24):** NODE_ENV, PORT, NODE_OPTIONS, LOG_LEVEL, DEPLOYMENT_PROFILE,
DATABASE_POOL_SIZE, QUEUE_CONSUMERS_ENABLED, CORS_ORIGINS, WEB_BASE_URL, TRUST_PROXY, STORAGE_DRIVER,
STORAGE_BUCKET, STORAGE_REGION, STORAGE_CREDENTIALS_SOURCE, STORAGE_PUBLIC_URL, MAIL_DRIVER,
MAIL_FROM_ADDRESS, AV_DRIVER, AV_ICAP_URL, OPENAPI_ENABLED, METRICS_DRIVER, LICENSING_MODE,
CONTROL_PLANE_URL, OUTBOUND_HTTP_ALLOWLIST.

**docs-api, secret bundle `<env>/docs-api` (11):** DATABASE_URL, TENANT_CATALOGUE, REDIS_URL,
REDIS_PASSWORD (also read by the Redis sidecar), JWT_ACCESS_SECRET, SIGNATURE_WITNESS_SECRET,
AUDIT_CHECKPOINT_SECRET, MFA_TOTP_SEALING_KEY, METRICS_SCRAPE_TOKEN, MAIL_RESEND_API_KEY,
CONTROL_PLANE_TOKEN.

**docs-provision:** the API environment with DEPLOYMENT_PROFILE=ON_PREMISE and
QUEUE_CONSUMERS_ENABLED=false, plus TENANT_SLUG and TENANT_NAME. It takes the API bundle except
REDIS_PASSWORD and TENANT_CATALOGUE, plus the one-run secret `docs-provision/<slug>`: TENANT_ID,
ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD.

**docs-db-admin:** PGHOST, PGPORT, PGDATABASE, PGSSLMODE, PGAPPNAME, HOME, TENANT_DATABASE,
DBADMIN_SQL, the RDS master username and password (RDS-managed secret), and from `<env>/docs-operator`
the keys EDMS_OWNER_PASSWORD, EDMS_APP_PASSWORD and EDMS_BACKUP_PASSWORD.

**docs-web:** NODE_ENV, PORT, NEXT_PUBLIC_API_URL, WEB_TRUST_PROXY.

**docs-scanner:** none. It uses the image's own configuration.

**Optional, unset:** SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT, OCR_*, OFFICE_* (the worker isn't deployed),
LICENSE_* (file mode isn't used).

## 10. Security findings

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| F-1 | Medium | `publish-images.yml` used tag-pinned actions in jobs that hold an AWS OIDC session with ECR push (review R-07b) | Fixed in #167 `a53852d`; **not merged** (B-1) |
| F-2 | Medium | The release image predates production licensing enforcement (#163). Deployed as is, Docs would grant every tenant every feature. | Open (B-2) |
| F-3 | Low | `munaxa-platform/infra/aws/stack/scripts/docs-cluster-roles.sql` is a copy of Docs `infra/sql/cluster/01-roles.sql`. A future role change in Docs could drift from it. [R] Add a CI diff check, or have docs-db-admin read the file from the Docs image. | Open, owner Agent 1 |
| F-4 | Low | `docs.test.munaxa.com` is DNS only, so the ALB is reachable directly, as with the other `*.test` hosts | Accepted by the contract |
| F-5 | Info | No secret is in Terraform state. The web and scanner read no secret. Production secrets are length-checked at boot. [V: `secrets.tf`, `configuration.ts`] | — |

## 11. Cost implications

The Fargate prices here are estimates **[A]** (about $0.0466 per vCPU-hour and $0.0051 per GB-hour in
eu-central-1, x86). They weren't checked against the Pricing API.

| Docs tasks | vCPU/GB | per hour |
| --- | --- | --- |
| web | 0.25 / 1 | ~$0.017 |
| api + redis | 0.5 / 2 | ~$0.034 |
| scanner | 0.25 / 2 | ~$0.022 |
| 3 public IPv4 | | $0.015 |
| **Total** | | **~$0.088/h** (`COST-ESTIMATE.md:31` uses the same figure) |

- Always on, that is about $63/month for Docs alone, so **Docs must run on-demand only**. At 40 session-hours it's about $3.50/month.
- The old Docs Production stack costs about $47.8/month while idle (29 Oct evidence). It stays until retirement is approved. With it running, the account can't stay at $50 (review R-02, owner decision).

## 12. Recommended next actions [R]

1. Merge #167 once GitHub syncs it (B-1).
2. Owner: tag `image/<sha>` from `main`, approve `image-release`, and record the three digests.
3. Agent 1: a reviewed PR that sets `images.docs_*` in `nonprod.tfvars`. Address F-3.
4. Agent 2 / owner: Control on Testing issues the Docs credential. The owner writes the `docs-api` and
   `docs-operator` bundles and creates the one-run `docs-provision/munaxa-internal` secret.
5. In the first session: docs-db-admin, then docs-provision, then the services. Smoke test:
   `/api/health/live`, sign-in, an upload with an AV scan, an entitlement lookup against Control, and the hourly usage report.
6. Owner decision: R-02 (the old Docs stack against the $50 target).

## 13. Explicit confirmation of what was not executed

Agent 4 did **not**:

- Run `terraform plan` or `apply` in any repository or root.
- Create, modify or delete any AWS resource. No AWS API call was made in this workstream.
- Read, create or modify any secret or secret value.
- Push an image tag, publish an image, approve an environment, or deploy.
- Run any database migration, local or remote.
- Change Cloudflare, DNS, Render or Supabase.
- Touch the existing Docs Production stack (`infra/terraform/eu-prod`, read only).
- Push an empty commit, close and reopen a PR, or bypass branch protection.

No test suite was run locally. All test evidence above is GitHub Actions runs.
