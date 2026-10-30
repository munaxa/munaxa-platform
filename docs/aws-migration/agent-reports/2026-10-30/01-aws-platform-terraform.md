# 01 · AWS Platform and Terraform (Agent 1)

Report date: 30 Oct 2026, refreshed 15:25 UTC against live GitHub state.
Repository: [munaxa/munaxa-platform](https://github.com/munaxa/munaxa-platform), `infra/aws/` and
`.github/workflows/aws-*.yml`. Account `229251310592`, region `eu-central-1`.

Legend: **[V]** verified now (command output, GitHub API or file read); **[A]** assumption or
estimate; **[R]** recommendation.

## 1. Scope and repository inspected

- Scope: audit the merged shared-stack Terraform (#24, #25), validate the public-ECS decision, review
  IAM, KMS, operator access, health checks and the cost model, find what Docs, Work, School, Control
  and Identity still need, fix it in code, and publish the shared contract. Code only.
- Inspected: `infra/aws/bootstrap/*.tf`, `infra/aws/stack/*.tf` (network, data, edge, services,
  ops, outputs, variables, envs/*), `infra/aws/modules/service/*`, `stack/scripts/db-bootstrap.sh`,
  `stack/tests/stack.tftest.hcl`, `.github/workflows/aws-terraform.yml`, `aws-session.yml`,
  `ci.yml`.
- Read for requirements, not changed: munaxa-docs `infra/terraform/{bootstrap,eu-prod}` and
  `infra/sql/cluster/01-roles.sql`; munaxa-control `apps/api/src/**/*.controller.ts` and
  `setup.ts`; munaxa-identity `apps/api/Dockerfile`, `apps/api/scripts/bootstrap-account.mjs` and
  `docs/runbooks/aws.md`; agent reports 3, 4, 6 and 7 in this folder.

## 2. Current implementation status

- **[V]** `main` = `c4a1ad0` (squash of #26). There are no open PRs in munaxa-platform.
- **[V]** The Terraform is complete for Testing (`nonprod`): network, RDS, KMS, bundles, buckets,
  cluster, ALB and all 10 services (Identity, Control API and portal, Work API and admin, School
  API and admin, Docs API, web and scanner) plus 9 run-only tasks. Every service exists only once
  its image digest is set.
- **[V]** Nothing is applied. No bootstrap exists in AWS; the repository variables
  `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` are unset (the dispatch jobs refuse to run without
  them, `aws-terraform.yml` "Refuse to run before bootstrap").
- **[A]** The production environment (`prod.tfvars`) was not re-audited beyond confirming that Docs
  and its bucket stay off there (no `hosts.docs`). That audit is incomplete.

## 3. Files and components reviewed

| Component | Files | Result |
|---|---|---|
| State | `bootstrap/main.tf`, `stack/backend.tf`, `envs/*.backend.hcl` | S3 + lockfile, KMS, versioned, TLS-only, public access blocked. Separate keys per env. OK |
| IAM | `bootstrap/iam.tf`, `modules/service/main.tf`, `stack/ops.tf`, `stack/docs.tf` | Boundary on every stack role; execution role per service scoped to its repo, log group and bundle; GitHub OIDC with repo-id subjects. Findings P1, P9, P11 |
| Network | `stack/network.tf`, `edge.tf` | Public tasks with a public IPv4, no NAT, isolated DB subnets, S3 gateway endpoint. Finding P3 |
| ECS / ECR | `modules/service/*`, `services.tf`, `bootstrap/main.tf` | Digests only, immutable tags, scan on push, circuit breaker, caps dropped, read-only rootfs where possible |
| RDS | `stack/data.tf`, `scripts/db-bootstrap.sh` | PG16 micro, private, encrypted, `force_ssl`, RDS-managed master secret; DB + owner + `NOBYPASSRLS` app role per product, `REVOKE ALL ... FROM PUBLIC` |
| KMS | `services.tf` (licence key and policy, #25), `data.tf` | Only the control-api task role may `kms:Sign` (ES256 digest), explicit deny for others, no grants. Findings P6, P10 |
| Operator access | `edge.tf`, `services.tf`, `cloudflare-access.md` | Host closed (403) until `operator_access` is set; Control verifies the Access JWT (control#5) |
| Workflows | `aws-terraform.yml`, `aws-session.yml` | Applies only via approved dispatch of a saved, intent-checked plan; session plan allow-list. Finding P1 |

## 4. Work completed

All work is in **[#26](https://github.com/munaxa/munaxa-platform/pull/26)**. Branch
`claude/project-thread-qotnc6`, commits `abf6af3`, `875083a`, `c701827` and `cfb01ee`, squash-merged
as **`c4a1ad0`** on 30 Oct at 14:39 UTC (merged by Claude under the standing merge rule, after the
independent reviewer cleared each commit).

| Change | Files | Requested by |
|---|---|---|
| Shared contract (hosts, ECR, ECS, roles, bundles, DBs, Identity issuer and audience, licensing, storage, cost) | `infra/aws/CONTRACT.md` (copy `SHARED-CONTRACT.md` here) | Coordinator |
| Docs recreated in the shared stack: docs-api (Redis sidecar, S3 task role), docs-web, docs-scanner (Cloud Map), bundles `docs-api` and `docs-operator`, `docs-db-admin`, `docs-provision`; only where `hosts.docs` is set | `stack/docs.tf`, `stack/scripts/docs-cluster-roles.sql` (vendored, with sha256), `variables.tf`, `data.tf`, `envs/nonprod.tfvars` | Agent 4, R-01 |
| `edms_backup` (BYPASSRLS) must not reach a non-Docs database: docs-db-admin raises an exception if it can | `stack/docs.tf` | R-14 |
| School and Docs file buckets (private, SSE-S3, TLS only, CORS for their own origin); School task role on `tenants/*`, `AWS_S3_BUCKET` and `AWS_REGION` | `stack/storage.tf`, `services.tf` | Agent 6 |
| The S3 gateway endpoint admits the file buckets | `stack/network.tf` | R-03 |
| Boundary: own `munaxa-<env>-*` buckets, pull-only on `munaxa-docs/*`. Deployer: configure `munaxa-<env>-*` buckets | `bootstrap/iam.tf` | R-01, R-03 |
| US$50 account budget, 80 % / 100 % actual and 100 % forecast alerts | `bootstrap/budget.tf`, `variables.tf` | R-09 |
| Identity `TRUST_PROXY_HOPS=1` | `services.tf` | Agent 3 (identity#2) |
| Licence key `prevent_destroy` | `services.tf` | R-04 |
| The Control API host forwards only `/api/v1/products/*`, `/api/v1/licensing/*` and `/health/*`; rule 21 refuses the rest in any case | `services.tf`, `edge.tf`, `modules/service/outputs.tf` | Agent 2, C4 |
| `identity-bootstrap` run-only task, with its password from the one-run secret `munaxa-<env>/identity-bootstrap` | `stack/ops.tf`, `variables.tf`, `outputs.tf` | R-16 |
| Bug: the saved plan was stored with the CI role's credentials, which have no S3 access; it is now stored as the deployer | `.github/workflows/aws-terraform.yml` | Found in audit (P1) |
| ALB idle timeout 120 s (Docs preview streams) | `stack/edge.tf` | Agent 4 |
| Tests: 11 → 14 plan runs (Docs on and off, Control API host allow-list) | `stack/tests/stack.tftest.hcl` | |

## 5. Work still in progress

None in this repository. Open verification items (P10, P11) can only be closed by the first real
plan and workflow run after G2.

## 6. PRs

| PR | Status | Head → merge |
|---|---|---|
| [munaxa-platform#26](https://github.com/munaxa/munaxa-platform/pull/26) | **Merged** 30 Oct 14:39 UTC | `cfb01ee` → `c4a1ad0` |
| [#25](https://github.com/munaxa/munaxa-platform/pull/25), [#24](https://github.com/munaxa/munaxa-platform/pull/24) (baseline, earlier threads) | Merged | `02477a9`, `c44f96e` |

## 7. CI and test results (evidence)

- **[V]** PR #26 at head `cfb01ee`, all check runs completed:
  - "Format, validate, mocked plan tests" (job 124116376033, run 41071456435): **success**
  - "Lint · Typecheck · Test · Build" (job 124116686005, run 41071456253): **success**
  - "Accessibility · contrast and keyboard…" (job 124116565325): **success**
  - "Façades match the platform surface" (job 124116775512): **success**
  - The Plan and Apply jobs were **skipped**, as designed (dispatch only).
- **[V]** `main` after the merge: [CI run 41073487240](https://github.com/munaxa/munaxa-platform/actions/runs/41073487240) on `c4a1ad0`: **success**.
- **[V]** Locally on `c4a1ad0` (15:25 UTC) with Terraform 1.16.5 and hashicorp/aws 6.67.0 from
  releases.hashicorp.com: `terraform fmt -check -recursive infra/aws` OK, `validate` on bootstrap
  and on stack "Success! The configuration is valid.", `terraform test` "Success! 14 passed,
  0 failed." Prettier 3.4.2 `--check` passed on the changed Markdown and YAML.
- **[V]** Not run: tflint, actionlint and shellcheck locally (they are not installed here).
  shellcheck runs in CI ("Format, validate…" job). No real `terraform plan` has run (needs G2).

## 8. Infrastructure dependencies

```text
G1 decisions ─► G2 bootstrap (root, CloudShell) ─► GitHub variables + environments
      │                   └─► G5 images per product (image/<sha> tag, image-release approval) ─► digest PRs
      ▼
G3 stack persistent layer: VPC, RDS, KMS data + licence, bundles, buckets, cluster, ACM
      │                   └─► G6 ACM validation CNAMEs in Cloudflare (DNS only)
      ▼
G4 bundle values (owner, console) ─► secret_version_ids PR
      ▼
G7 session up ─► host CNAMEs (first session) ─► db-admin ─► docs-db-admin ─► identity-migrate
   ─► identity-bootstrap (steps 1-3) ─► control-migrate ─► work-migrate ─► school-migrate ─► docs-provision
      ▼
Identity ─► Control API (licence key public half ─► PR) ─► portal behind Cloudflare Access
      ▼
Control issues mxc_ credentials ─► Work, School, Docs bundles ─► products up ─► smoke ─► session down
```

External prerequisites: the Docs images must be rebuilt after docs#167 (Agent 4); School#21 and
#23 (task-role S3, no SSE header on presigned PUTs) depend on the bucket's default SSE-S3; identity#2
pairs with `TRUST_PROXY_HOPS=1`; control#5 is required before `operator_access` opens the operator
host.

## 9. Required environment variables (names only)

Set by Terraform (plain) and by bundles (secret). Full per-service lists are in `CONTRACT.md` §5,
`services.tf` and `docs.tf`. Platform-owned additions in #26:

- identity: `TRUST_PROXY_HOPS`.
- school-api: `AWS_S3_BUCKET`, `AWS_REGION`.
- docs-api: `NODE_ENV`, `PORT`, `NODE_OPTIONS`, `LOG_LEVEL`, `DEPLOYMENT_PROFILE`,
  `DATABASE_POOL_SIZE`, `QUEUE_CONSUMERS_ENABLED`, `CORS_ORIGINS`, `WEB_BASE_URL`, `TRUST_PROXY`,
  `STORAGE_DRIVER`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_CREDENTIALS_SOURCE`,
  `STORAGE_PUBLIC_URL`, `MAIL_DRIVER`, `MAIL_FROM_ADDRESS`, `AV_DRIVER`, `AV_ICAP_URL`,
  `OPENAPI_ENABLED`, `METRICS_DRIVER`, `LICENSING_MODE`, `CONTROL_PLANE_URL`,
  `OUTBOUND_HTTP_ALLOWLIST`; bundle `DATABASE_URL`, `TENANT_CATALOGUE`, `REDIS_URL`,
  `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `SIGNATURE_WITNESS_SECRET`, `AUDIT_CHECKPOINT_SECRET`,
  `MFA_TOTP_SEALING_KEY`, `METRICS_SCRAPE_TOKEN`, `MAIL_RESEND_API_KEY`, `CONTROL_PLANE_TOKEN`.
- docs-web: `NODE_ENV`, `PORT`, `NEXT_PUBLIC_API_URL`, `WEB_TRUST_PROXY`.
- docs-db-admin: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE`, `PGAPPNAME`, `TENANT_DATABASE`,
  `DBADMIN_SQL`; secret `PGUSER`, `PGPASSWORD` (RDS master), `EDMS_OWNER_PASSWORD`,
  `EDMS_APP_PASSWORD`, `EDMS_BACKUP_PASSWORD`.
- docs-provision: the docs-api env + `TENANT_SLUG`, `TENANT_NAME`; secret `TENANT_ID`,
  `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (one-run secret).
- identity-bootstrap: `NODE_ENV`; secret `DIRECT_DATABASE_URL`, `IDENTITY_OWNER_EMAIL`,
  `IDENTITY_OWNER_PASSWORD` (one-run secret).
- GitHub (names only, not secrets): `AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN`,
  `AWS_IMAGE_PUBLISHER_ROLE_ARN`.

## 10. Security findings

| # | Sev | Finding | Status |
|---|---|---|---|
| P1 | High | `aws-terraform.yml` stored and fetched the saved plan with the CI role, which has no S3 access, so every apply dispatch would have failed. | **Fixed** (#26) |
| P2 | High | Docs had no home in the shared stack; the boundary denied `munaxa-docs/*` ECR. | **Fixed** (#26) |
| P3 | High | The S3 gateway endpoint admitted only the ECR layer bucket, and the boundary had no S3 permission, so any task S3 call would have failed. | **Fixed** (#26) |
| P4 | High | School had no bucket, bucket env var or task role. | **Fixed** (#26) |
| P5 | Medium | Identity behind the ALB without `TRUST_PROXY_HOPS`: all clients shared one per-IP login limiter. | **Fixed** (#26) |
| P6 | Medium | The licence key is count-gated on the Control image and had no `prevent_destroy` (R-04). | **Fixed** (#26) |
| P7 | Medium | `edms_backup` is BYPASSRLS on a shared instance (R-14). | **Fixed** (#26): fails closed |
| P8 | Medium | Identity bootstrap password passed as a run-task override (R-16). | **Fixed** (#26): one-run secret |
| P12 | Low | ALB path deny on `/api/v1/admin/*` was case-sensitive while Express is not (C4). | **Fixed** (#26): allow list; clients must use lowercase paths |
| P13 | Low | No budget backstop (R-09). | **Fixed** (#26) |
| P9 | Medium | The deployer has `ec2:*`, `elasticloadbalancing:*`, `ecs:*` and `rds:*` on `*`, limited to the region. Docs Production RDS, ECS, secrets and S3 are denied by ARN, but its VPC, security groups and ALB are not. | **Open**, owner decision [R: deny by tag `ManagedBy` of the Docs stack] |
| P10 | Verify | The licence key policy gives the account no `kms:GetKeyRotationStatus`. If the AWS provider reads it for an asymmetric key, refresh fails with AccessDenied. **[A]** | Open, first real plan (G3) |
| P11 | Verify | The OIDC trusts use the `repo:munaxa@<id>/<repo>@<id>` subject form. If GitHub issues the default `repo:munaxa/<repo>` form, no role can be assumed. **[A]** | Open, first workflow run after G2 |
| P14 | Info | `IDENTITY_AUTH_AUDIENCE=munaxa-work,munaxa-control` puts both audiences in every token (Identity's open point). | Open, Agent 3 |
| P15 | Info | The ALB is directly exposed on `*.test` hosts: Universal SSL cannot proxy second-level names. Only `operator-test` is proxied, behind Access. | Accepted for Testing |

## 11. Cost implications

The prices are **[A]** on-demand list prices from memory. A Pricing API check could not run
because the AWS connector needed a new sign-in (14:10 UTC).

| Item | Monthly |
|---|---|
| Testing idle: RDS stopped 20 GB gp3 ($2.74), KMS data, licence and state ($3), 10 bundles + RDS master secret ($4.40), private zone ($0.50), ECR, logs and empty buckets (<$3) | **≈ $13** |
| Testing per session hour, all 10 services: Fargate 3 vCPU / 9 GB ($0.19), ALB + LCU ($0.035), 12 public IPv4 ($0.06), RDS micro ($0.02) | **≈ $0.30/h** |
| Session hours within $50 | **≈ 120 h/month** |
| Docs Production idle stack (same account, kept by decision) | **≈ $48** (29 Oct cost evidence) |
| **Account, idle, before any session** | **≈ $61, over the $50 target** |

The Docs share is about $0.09 per session hour. Always on, Docs alone would cost about $63 a month.
Production always-on was not re-estimated in this pass (#24 estimated about $170 to $230).

## 12. Blockers and owners

| Blocker | Owner |
|---|---|
| G2 bootstrap re-apply as root (now includes the boundary, deployer and budget changes) | Tamer |
| Account over $50 while Docs Production stays (G9 retirement decision) | Tamer |
| GitHub variables and environments (`aws-nonprod`, `aws-nonprod-session`, `image-release`) | Tamer |
| Cloudflare: ACM validation and host CNAMEs; the Access application, then `operator_access` | Tamer |
| Bundle values and the one-run secrets | Tamer |
| Image publication per product; Docs needs docs#167 first | Tamer, after each agent's PRs |
| P9 deployer scope over Docs Production network resources | Tamer (decision), Agent 1 (code) |

## 13. Recommended next actions [R]

1. Tamer: re-apply `infra/aws/bootstrap` as root in CloudShell (README G2), then set the GitHub
   variables and environments.
2. Agent 1: dispatch `aws-terraform.yml` `nonprod`/`plan`, record every address in
   `envs/nonprod.expected-changes.json` by PR, and check P10 and P11 in that run.
3. Tamer: approve the G3 apply; add the ACM validation CNAMEs.
4. In parallel, each product: merge its open PRs, then publish images after approval.
5. Tamer: decide on G9 (Docs Production) and on P9.

## 14. Not executed (explicit)

No `terraform plan` or `apply` against AWS; no AWS, KMS, IAM, S3, RDS or Secrets Manager call or
change (the only AWS connector call, a read-only Pricing query, failed on sign-in); no secret
created or read; no image built or published; no deployment or database migration; no Cloudflare,
Render or Supabase change; no change to the Docs Production stack or `canteenhub-prod`. No secret
value is in this report or in the repository.
