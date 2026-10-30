# Munaxa shared AWS contract (Testing and Production)

The interface between the shared stack (`munaxa-platform/infra/aws`) and the products that run on
it: Identity, Control, Work, School and Docs. A product follows this contract; the stack provides
exactly this. A change to either side is a PR here first. Owner: the platform (Agent 1).

Status: 30 Oct 2026. Nothing in it is applied. Account `229251310592`, region `eu-central-1` only.

## 1. Environments and names

| Item              | Testing (`nonprod`)                     | Production (`prod`)           |
| ----------------- | --------------------------------------- | ----------------------------- |
| Prefix            | `munaxa-nonprod`                        | `munaxa-prod`                 |
| Run model         | On-demand sessions (`aws-session.yml`); nothing runs between sessions; 20:00 UTC backstop | Always on |
| Cloud Map         | `nonprod.munaxa.internal`               | `prod.munaxa.internal`        |
| Log groups        | `/munaxa/nonprod/<service>`, 14 days    | `/munaxa/prod/<service>`, 30 days |
| Tags              | `Project=munaxa`, `Stack=shared`, `Environment=<env>`, `ManagedBy` (provider default tags) | same |

### Hosts (Cloudflare DNS, CNAME to the ALB, DNS only unless stated)

| Host key      | Testing                        | Routes                                                                 |
| ------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `identity`    | `id.test.munaxa.com`           | `/*` → identity:4001                                                   |
| `control_api` | `control-api.test.munaxa.com`  | `/api/v1/admin/*` → 403; `/*` → control-api:3100                       |
| `operator`    | `operator-test.munaxa.com` (proxied, Cloudflare Access) | `/api/auth/*` → identity; `/*` → control-portal:3200; closed (403) until `operator_access` is set |
| `work`        | `work.test.munaxa.com`         | `/api/auth/*` → identity; `/api/v1/*` → work-api:3000; `/*` → work-admin:3001 |
| `school`      | `school.test.munaxa.com`       | `/api/v1/*` → school-api:4000; `/*` → school-admin:3000                |
| `docs`        | `docs.test.munaxa.com`         | `/api/v1/preview/stream*` → docs-api:3001; `/*` → docs-web:3000 (web calls the API privately) |

ALB: HTTPS only (TLS 1.2+, `ELBSecurityPolicy-TLS13-1-2-2021-06`), HTTP → 301, idle timeout 120 s
(Docs preview streams), `drop_invalid_header_fields`, default 404. The ALB is the one proxy hop:
services that read client IPs trust exactly one hop (`TRUST_PROXY_HOPS=1`, or the ALB subnets for
Docs' `TRUST_PROXY`).

## 2. Images (ECR)

- Repository: `munaxa-<product>/<image>` in this account. Immutable tags, scan on push, last 20
  tagged images kept, untagged expire after 7 days.
  - Identity `api`, `migrate`; Control `api`, `migrate`, `portal`; Work `api`, `admin`, `migrate`;
    School `api`, `admin`, `migrate`: created by `bootstrap/`.
  - Docs `api`, `web`, `antivirus`: the existing repositories from the Docs bootstrap, reused, not
    duplicated. Shared roles may only pull from them.
- Publishing: a product's `Publish images to ECR` workflow, on a git tag `image/<40-hex sha>` of a
  `main` commit, in the protected `image-release` environment, through the product's OIDC
  publisher role. Image tag = the commit sha.
- Terraform references images **by digest only**:
  `229251310592.dkr.ecr.eu-central-1.amazonaws.com/munaxa-<product>/<image>@sha256:<64 hex>`, set
  by PR in `stack/envs/<env>.tfvars` (`images`). Third-party images (Valkey, Redis, PostgreSQL
  client) come from `public.ecr.aws/docker/library/...@sha256:...`.
- Platform: `linux/amd64` (`X86_64`). An arm64 image does not start.

## 3. ECS conventions

- Fargate, `awsvpc`, public subnets with a public IPv4, no NAT; ECS Exec off.
- Every container: non-root user, all Linux capabilities dropped, read-only root filesystem unless
  the service is listed as writable (Next.js admins, Valkey/Redis, migrations, the Docs scanner).
- A container health check in the task definition (ECS ignores the image `HEALTHCHECK`), and an
  ALB target-group check on the health path below. Circuit breaker with rollback.
- Nothing migrates on service start. Migrations are run-only tasks, dispatched by the operator.

| Service        | Port | CPU/MiB   | ALB health path            | Container health (`127.0.0.1`) | DB  | Task role |
| -------------- | ---- | --------- | -------------------------- | ------------------------------ | --- | --------- |
| identity       | 4001 | 512/1024 + Valkey | `/api/auth/health/ready` | `/api/auth/health/live`  | yes | none |
| control-api    | 3100 | 256/512   | `/health/ready`            | `/health/live`                 | yes | `kms:Sign` on the licence key |
| control-portal | 3200 | 256/512   | `/healthz`                 | none                           | no  | none |
| work-api       | 3000 | 256/512   | `/health/ready`            | `/health/live`                 | yes | none |
| work-admin     | 3001 | 256/512   | `/`                        | none                           | no  | none |
| school-api     | 4000 | 256/512   | `/api/v1/health/ready`     | `/api/v1/health/live`          | yes | S3 on its bucket, `tenants/*` |
| school-admin   | 3000 | 256/512   | `/login`                   | none                           | no  | none |
| docs-api       | 3001 | 512/2048 + Redis | `/api/health/live`  | `/api/health/live`             | yes | S3 on its bucket |
| docs-web       | 3000 | 256/1024  | `/login`                   | none                           | no  | none |
| docs-scanner   | 1344 | 256/2048  | not routed                 | c-icap scan of a probe file    | no  | none |

Run-only tasks: `db-admin` (shared databases), `<product>-migrate` (identity, control, work,
school; owner role), `docs-db-admin` (Docs cluster roles and the tenant database),
`docs-provision` (Docs migrate and first administrator).

Private calls (Cloud Map, plain HTTP inside the VPC, security group to security group):
control-portal → `control-api.<env>.munaxa.internal:3100`; work-admin →
`work-api.<env>.munaxa.internal:3000`; docs-web → `docs-api.<env>.munaxa.internal:3001`;
docs-api → `icap://docs-scanner.<env>.munaxa.internal:1344/avscan`. Every other call between
products goes over HTTPS by the public host (an on-premises installation does the same).

## 4. Roles

- Path `/munaxa-shared/`, permissions boundary `munaxa-shared-workload-boundary` (bootstrap) on every
  role the stack creates. Names `munaxa-<env>-<service>-execution` and `-task`.
- Execution role: pull its own ECR repository, write its own log group, read its own secret bundle
  (and decrypt it through Secrets Manager only).
- Task role: only when the service calls AWS (table above). Products use the SDK default
  credential chain (ECS container credentials). **No access key is ever set**:
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_S3_ENDPOINT` are never in a task.
- No IAM user, no access key, anywhere (owner decision).

## 5. Secrets

- One Secrets Manager secret ("bundle") per service or task, JSON, name `munaxa-<env>/<bundle>`,
  encrypted with the environment data key. Terraform creates the containers only; the owner writes
  values and pins versions by PR (`secret_version_ids`). Values never in git, Terraform, logs or chat.
- Injected as ECS `secrets` with the key name as the variable name.

| Bundle            | Keys                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `identity`        | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` |
| `control-api`     | `DATABASE_URL`                                                                         |
| `work-api`        | `DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN`                              |
| `school-api`      | `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CONTROL_PLANE_TOKEN`, `RESEND_API_KEY` |
| `<product>-migrate` | `DATABASE_MIGRATION_URL` (the owner role)                                            |
| `docs-api`        | `DATABASE_URL`, `TENANT_CATALOGUE`, `REDIS_URL`, `REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `SIGNATURE_WITNESS_SECRET`, `AUDIT_CHECKPOINT_SECRET`, `MFA_TOTP_SEALING_KEY`, `METRICS_SCRAPE_TOKEN`, `MAIL_RESEND_API_KEY`, `CONTROL_PLANE_TOKEN` |
| `docs-operator`   | `EDMS_OWNER_PASSWORD`, `EDMS_APP_PASSWORD`, `EDMS_BACKUP_PASSWORD` (docs-db-admin only) |
| `docs-provision/<tenant slug>` | `TENANT_ID`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`; created by the owner for one run, then deleted |

Plain (non-secret) configuration is set in Terraform `environment` and is listed per service in
`stack/services.tf` and `stack/docs.tf`.

## 6. Databases

One PostgreSQL 16 instance per environment (`munaxa-<env>-pg`, private, `rds.force_ssl=1`). URLs
use `?sslmode=require`. Per product: its own database, an owner role (migrations) and a runtime
role (`NOBYPASSRLS`, `CONNECT` revoked from `PUBLIC`), created by `db-admin` from the bundle URLs:

| Product  | Database   | Owner            | Runtime          |
| -------- | ---------- | ---------------- | ---------------- |
| Identity | `identity` | `identity_owner` | `identity_app`   |
| Control  | `control`  | `control_owner`  | `control_app`    |
| Work     | `work`     | `work_owner`     | `work_app`       |
| School   | `school`   | `school_owner`   | `munaxa_app`     |
| Docs     | one per tenant, `edms_<tenant>` (ADR-0015) | `edms_owner` | `edms_app` (+ `edms_backup`, read-only `BYPASSRLS`) |

Order in a session: `db-admin` → `docs-db-admin` → `identity-migrate` → `control-migrate` →
`work-migrate` → `school-migrate` → `docs-provision`. Clean databases; no data is copied from
Supabase, Render or Docs Production.

## 7. Identity (issuer and audience)

- Issuer: `IDENTITY_BASE_URL` = `https://id.test.munaxa.com` (Production `https://id.munaxa.com`).
  Verifiers set their issuer to this string **exactly** (no trailing slash).
- Algorithm `ES256`; key id `IDENTITY_SIGNING_KID`; public keys published to verifiers as JSON
  `[{"kid": "...", "publicKey": "<SPKI PEM>"}]` (Terraform `identity_public_keys`).
- Audiences: `munaxa-work` (Work: `PLATFORM_AUTH_*`), `munaxa-control` (Control operators:
  `OPERATOR_AUTH_*`). Identity issues `IDENTITY_AUTH_AUDIENCE=munaxa-work,munaxa-control`.
- Browser sign-in for Work and the operator portal is same-origin: `/api/auth/*` on the product's
  host goes to Identity (Identity ADR-0004). `CSRF_TRUSTED_ORIGINS` lists those origins.
- **No OIDC.** Identity has no discovery, authorize or JWKS endpoints by design (ADR-0004). School
  and Docs keep their own sign-in for Testing; single sign-on for them is a later phase.
- MFA: Identity issues no `mfa` claim yet, so Control runs `OPERATOR_REQUIRE_MFA=false` with
  `OPERATOR_SUBJECT_ALLOWLIST` and Cloudflare Access in front of the operator host.

## 8. Licensing (Control)

- Products set `LICENSING_MODE=CONTROL_PLANE`, `CONTROL_PLANE_URL=https://control-api.test.munaxa.com`
  (Production `https://control-api.munaxa.com`) and `CONTROL_PLANE_TOKEN` (the deployment's `mxc_…`
  credential, issued in the operator portal, written to the product's bundle). Production builds
  refuse `NONE` (Work, Docs) and `DATABASE` (School).
- Docs also needs the Control host in `OUTBOUND_HTTP_ALLOWLIST` (derived in Terraform).
- Control signs licences with a KMS key `ECC_NIST_P256` / `SIGN_VERIFY` (`alias/munaxa-<env>-control-licence`,
  ADR-0008): only the control-api task role may `kms:Sign`, `ECDSA_SHA_256` digests only; no grants.
  `LICENCE_SIGNING_KID` and `LICENCE_SIGNING_PUBLIC_KEY` (SPKI PEM, public) are set by PR after
  the key exists. Verifiers read `/api/v1/licensing/public-keys`.
- The Control admin API (`/api/v1/admin/*`) is never public: 403 on the public host, reachable
  only from the portal over Cloud Map; the portal and API verify the Cloudflare Access token
  (`OPERATOR_ACCESS_TEAM_DOMAIN`, `OPERATOR_ACCESS_AUDIENCE`).

## 9. Storage

| Bucket                                       | Product | Env on the service                    | Task role                               |
| -------------------------------------------- | ------- | ------------------------------------- | --------------------------------------- |
| `munaxa-<env>-school-files-229251310592`     | School  | `AWS_S3_BUCKET`, `AWS_REGION`         | Put/Get/Delete on `tenants/*`; ListBucket |
| `munaxa-<env>-docs-files-229251310592`       | Docs    | `STORAGE_DRIVER=S3`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_CREDENTIALS_SOURCE=ECS_TASK_ROLE` | Get/Put/Delete/AbortMultipartUpload; ListBucket |

Private, Block Public Access, SSE-S3, TLS only, CORS for the product's own origin only. Browsers
use presigned URLs. Tasks reach S3 through the VPC gateway endpoint, which admits only the ECR
layer bucket and these buckets.

## 10. Cost rules

Testing targets about US$50 a month for the account, so: nothing always-on in nonprod except the
persistent layer (stopped RDS, keys, bundles, empty buckets); every service follows
`services_enabled`; every routed service follows `edge_enabled`; a budget alerts at 80 % and
100 % (bootstrap). The idle Docs Production stack (about US$48 a month) is in the same account and
counts against it until its retirement is approved.
