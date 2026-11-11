# Munaxa shared AWS hosting

Terraform for the shared AWS stack that hosts **Munaxa Identity, Control, Work, School and Docs**
in `eu-central-1`, per the shared AWS hosting ADR (draft, `/mnt/project-files/aws-next-phase/`).
Docs is recreated here (`stack/docs.tf`, where `hosts.docs` is set: Testing now). The Docs
Production stack (`munaxa-docs/infra/terraform`) is not managed here and stays until its
retirement is approved (G9). The interface every product follows is [CONTRACT.md](CONTRACT.md).

**Status (5 Nov 2026):** `bootstrap/` is applied (G2 on 31 Oct; re-applied on 5 Nov at `46dfbd9` and
at `6b8997a`, the second re-apply PARTIALLY VERIFIED). `stack/` has **never been applied**: G3 is not
authorized, and no Testing or Production workload resource is evidenced. No product image is in the
shared ECR repositories. Evidence: `docs/aws-migration/agent-reports/` (index `README.md`). Every step
below that creates, changes or deletes anything is an owner approval gate (G1 to G9).

**Access (8 Nov 2026):** during development the owner and Claude use the existing root account (MFA
on, no root keys) and the existing root-connected Claude AWS connector; no IAM user, role or Identity
Center is created just to develop or run read-only checks. Deployment-stage IAM (Identity Center,
permission sets, break-glass) is prepared but deferred. Policy: [ACCESS-POLICY.md](ACCESS-POLICY.md).

## Layout

| Path                     | What                                                                                           | Applied by                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `bootstrap/`             | State bucket and key, ECR repositories, workload boundary, a deployer and a CI role per environment, image publishers | Root, in AWS CloudShell (as Docs' bootstrap) |
| `stack/`                 | One environment: network, RDS, keys, secret bundles, cluster, ALB, services, operator tasks    | GitHub Actions (`aws-terraform.yml`)       |
| `stack/envs/<env>.*`     | `nonprod` (on-demand Testing) and `prod`: variables, backend key, declared intent              |                                            |
| `modules/service/`       | One ECS Fargate service or run-only task, with its roles, security group and routing           |                                            |
| `stack/scripts/`         | `db-bootstrap.sh`, the db-admin task's script (databases and roles per product)                |                                            |
| `stack/tests/`           | Plan-only tests with a mocked provider (`terraform test`)                                      | CI, on every PR                            |

## Architecture

```text
                          Cloudflare DNS (CNAMEs, DNS only)          operator network only
                                         │                                     │
        ┌────────────────────────────────▼─────────────────────────────────────▼──────────┐
        │ ALB  munaxa-<env>   HTTPS (TLS 1.2+), HTTP→HTTPS, default 404                       │
        │  id.*          ─────────────────────────────────────────► identity  (+ Valkey sidecar)
        │  work.*        /api/auth/* ► identity · /api/v1/* ► work-api · /* ► work-admin       │
        │  school.*      /api/v1/* ► school-api · /* ► school-admin                               │
        │  control-api.* /api/v1/{products,licensing}/*, /health/* ► control-api · rest ► 403  │
        │  docs.*        /api/v1/preview/stream* ► docs-api (+ Redis) · /* ► docs-web          │
        │  operator.*    from operator_cidrs: /api/auth/* ► identity · /* ► control-portal     │
        │                anyone else ► 403                                                     │
        └──────────────────────────────────────────────────────────────────────────────────────┘
          public subnets (2 AZ), tasks with public IPv4, no NAT, S3 gateway endpoint (ECR layers)
              │ 5432, from each service's own security group only
        ┌─────▼──────────────────────────┐   private names (Cloud Map): control-api.<env>.munaxa.internal
        │ RDS PostgreSQL 16 db.t4g.micro │   (portal → admin API), work-api.<env>.munaxa.internal
        │ databases: identity, control,  │   (Work admin → API)
        │ work, school; owner + app role │
        │ each; isolated subnets         │   KMS: data key (RDS, bundles, logs); Control licence
        └────────────────────────────────┘   key ECC_NIST_P256 SIGN_VERIFY (Control ADR-0008)
```

**Dependency order:** Identity (issuer) → Control API (licence source; verifies Identity tokens) →
Control portal → Work and School (both need Control for `LICENSING_MODE=CONTROL_PLANE`; Work needs
Identity for every authenticated route) → Docs (its own stack; needs Control and docs#164's TLS fix).

**Operator access:** the owner chose Cloudflare Access. The Testing operator host is
`operator-test.munaxa.com`, the one proxied record; it stays closed (403) until Control verifies the
Access token. Design, open decisions and the MFA limitation: [cloudflare-access.md](cloudflare-access.md).

**Isolation:** one database, one owner role and one runtime role per product; `CONNECT` revoked from
`PUBLIC`; a secret bundle per service and per migration job; each execution role reads only its own
bundle. Runtime roles are `NOBYPASSRLS`, so each product's RLS policies apply.

## Approval gates

| Gate | Action                                                                                    | Who / where                       | Reversible                          |
| ---- | ----------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------- |
| G1   | Decide the account (`account_id`), hostnames, Control ADR-0008 (KMS) and operator access | Owner                             | Yes, before G2                      |
| G2   | Apply `bootstrap/` in CloudShell; set repository variables                               | Owner as root                     | Yes (destroy; ECR must be empty)    |
| G3   | First apply of `stack/` nonprod persistent layer (VPC, RDS, keys, bundles, cluster)      | Owner approves `aws-nonprod`      | Yes; RDS keeps a final snapshot     |
| G4   | Write secret values into the bundles; pin `secret_version_ids`                           | Owner in the console              | Rotate                              |
| G5   | Publish images (tag `image/<sha>`, `image-release` approval) and set digests by PR       | Owner                             | Yes, previous digest                |
| G6   | DNS: certificate validation records and CNAMEs in Cloudflare                             | Owner                             | Yes                                 |
| G7   | Testing session up; db-admin; migrations; smoke tests                                    | Owner dispatches                  | Session down                        |
| G8   | Production: the same as G3 to G7 for `prod`                                              | Owner approves `aws-prod`         | Previous digest; database restore   |
| G9   | Retire Render, Supabase and the old Docs stack                                           | Owner, one by one                 | **No**                              |

## Runbook

### G2. Bootstrap (root, CloudShell)

1. Check out the reviewed commit in CloudShell. In `bootstrap/backend.tf`, comment out the backend
   block for the first apply.
2. `terraform init && terraform plan` and read the plan: 49 resources to add (the bucket, a key, 11
   ECR repositories with lifecycle policies, 1 policy, 8 roles and their inline policies (a CI role and a deployer for each of nonprod and prod, and four image publishers), and the
   account budget and a Testing budget on the `Environment = nonprod` tag, both alerting admin@ and alert@munaxa.com). Nothing else. Then
   `terraform apply`. The Docs ECR repositories are the Docs bootstrap's and are not created here.
3. Restore the backend block and run `terraform init -migrate-state`.

   A bootstrap that is already applied is updated the same way (plan, read, apply as root). The
   Docs and storage change needs it before `stack/` can create the buckets: the boundary admits the
   stack's own `munaxa-<env>-*` buckets and pulls from `munaxa-docs/*`, and the deployer may
   configure those buckets.
4. In GitHub, **first** create the environments below with their protection rules (a job that
   names an environment that does not exist creates it unprotected, and the session schedule
   starts as soon as `AWS_CI_ROLE_ARN` is set). Then set `AWS_CI_ROLE_ARN` and
   `AWS_DEPLOYER_ROLE_ARN` on `munaxa-platform` from the
   `ci_role_arns` and `deployer_role_arns` outputs: the `nonprod` pair as repository variables
   (`aws-session.yml` reads them before its job starts), and the `prod` pair as variables of the
   `aws-prod` environment, which override the repository's for prod jobs. A prod job that finds the
   nonprod role is refused by its trust, so a missing override fails closed (R-17). Set
   `AWS_IMAGE_PUBLISHER_ROLE_ARN` on each product repository. They are role names, not
   credentials. Create the environments `aws-nonprod` and `aws-prod` (required reviewer: owner,
   `main` only), `aws-nonprod-session` (`main` only) and, in each product repository,
   `image-release` (required reviewer, `image/*` tags only).

### G3. The persistent layer

1. In a PR, declare the first apply in `stack/envs/nonprod.expected-changes.json` (every address the
   plan creates; run `aws-terraform.yml` with `plan` first to list them).
2. Dispatch `aws-terraform.yml` with `nonprod` / `apply`, read the plan, approve it, approve the apply.
3. The ALB does not exist yet (`edge_enabled = false`). The certificate is requested: add the
   `certificate_validation_records` output to Cloudflare as **DNS only** records (G6).

### G4. Secret values (owner, console or CloudShell)

Never in git, Terraform, a workflow log or a chat. For each bundle in the `secret_bundles` output,
write one JSON secret version with the keys listed in `stack/data.tf`.

- **Database URLs:** generate two passwords per product (`openssl rand -hex 32`; hex only, as
  `db-bootstrap.sh` requires). Runtime URL in `<env>/<product>` (`DATABASE_URL`), owner URL in
  `<env>/<product>-migrate` (`DATABASE_MIGRATION_URL`), both
  `postgresql://<role>:<password>@<database_endpoint>:5432/<database>?sslmode=require`. The host
  must be the `database_endpoint` DNS name exactly, never an IP address or another alias:
  node-postgres (Work's API, Work's and Identity's bootstrap scripts) reads `require` as
  `verify-full` and checks the certificate's host name. Role names:
  `identity_owner`/`identity_app`, `control_owner`/`control_app`, `work_owner`/`work_app`,
  `school_owner`/`munaxa_app` (the names each product's migrations grant to).
- **Identity:** `IDENTITY_SIGNING_PRIVATE_KEY` (`pnpm keys:generate` in munaxa-identity; keep the
  existing staging key only if Work tokens signed by it must keep verifying, which nothing needs
  in Testing), `IDENTITY_SIGNING_SECRET`, `REDIS_PASSWORD` and `REDIS_URL`
  (`redis://:<password>@127.0.0.1:6379`). Its public half goes into `identity_public_keys`.
- **Identity, hardened images only (AW-01):** an Identity image built from munaxa-identity main
  after the security hardening (identity#7 to #14) refuses to start without `MFA_ENCRYPTION_KEYS`
  in the bundle: its own key ring, `kid=key` with 32 random bytes per entry in base64url, generated
  where it is stored and never the signing key or `IDENTITY_SIGNING_SECRET` (munaxa-identity
  `docs/runbooks/mfa.md`). Adding it creates a new bundle version: that version is the existing
  JSON plus this one key, every other value unchanged (a fresh `put-secret-value` replaces the whole
  JSON; a new `IDENTITY_SIGNING_SECRET` would invalidate every refresh token, a dropped key stops
  the task). `secret_version_ids.identity` then moves to that version in the same PR that sets
  `identity_security_config` (the key's kid, an explicit `mfa_policy`) and pins the hardened image.
  The same pin is used by the Valkey sidecar and by `db-admin` (`ops.tf`), so that PR's
  `envs/nonprod.expected-changes.json` also declares the `db_admin` task definition change. Its migration `20261111130000_identity_mfa`
  runs before the new image starts. Release `5277d71` keeps `identity_security_config` unset.
- **Work:** `PII_MATCH_SECRET` (not the development default), `CONTROL_PLANE_TOKEN` (G7 step 4).
- **`CONTROL_PLANE_TOKEN` before the first start:** ECS refuses to start a task whose bundle lacks a
  key it injects, and Work and School refuse a token under 20 characters, Docs under 32. Until G7
  step 4 issues the real `mxc_` credentials, write a placeholder of at least 32 random characters
  (`openssl rand -hex 16`) or keep those services at `desired_counts = 0`. Licence checks fail
  with the placeholder, which is the expected state until step 4.
- **School:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different), `CONTROL_PLANE_TOKEN`,
  `RESEND_API_KEY` (sending access only).
- Then pin each bundle with `secret_version_ids` in a PR.

### G5. Images

Each product repository's `Publish images to ECR` workflow builds from a tag `image/<40-hex sha>`
on `main`, in the `image-release` environment, and pushes to `munaxa-<product>/<image>`. A PR sets
the digests in `stack/envs/<env>.tfvars` (`images`), with `valkey_image` and `postgres_image` from
`public.ecr.aws` by digest.

### G6. DNS

Within 72 hours of G3, add the `certificate_validation_records` output to Cloudflare as DNS only
records. On the first session, add a CNAME from each host to `alb_dns_name` (DNS only), and the
operator host as the one proxied record behind Cloudflare Access.

### G7. A Testing session

0. First session only, before step 1 (Control refuses to start without these, and Terraform
   refuses a session that runs `control-api` above zero tasks until they are set):
   a. Merge the image digests with `services_enabled = false`, **together with** `operator_access`
      (cloudflare-access.md; Terraform refuses any Control image without it), `valkey_image`,
      `identity_signing_kid` and `identity_public_keys` (G4), and `desired_counts` 0 for
      `control-api` and `control-portal`, and apply (G3 workflow). This creates the Control licence
      key (`control_licence_key_arn`) without starting any task.
   b. In CloudShell read its public half (`aws kms get-public-key`, DER to PEM) and set
      `control_licence_public_key` and `control_licence_kid` by PR.
   c. `control_operator_organisation_id` and `control_operator_subjects` come from Identity's
      steps 1 to 3 (step 3 below), so the first session runs `control-api` and `control-portal`
      at `desired_counts` 0 until they are set by PR.

   **Every configuration PR needs its own apply with services off.** Image digests,
   `secret_version_ids`, `identity_*`, `control_licence_*` and `control_operator_*` all change an
   `aws_ecs_task_definition`, and the session workflow refuses any change outside the load
   balancer, certificate validation, ECS services and service discovery. So each such PR is merged,
   then applied through `aws-terraform.yml` (`plan`, read, `apply`) with an updated
   `envs/nonprod.expected-changes.json`, while the session is down; only then dispatch `up`.
1. Dispatch `aws-session.yml` → `up`. The ALB, listeners and services come up; the database starts.
2. Add CNAMEs in Cloudflare from each host to `alb_dns_name` (DNS only), first session only.
3. Run the db-admin task, then the migrations, in order, with `aws ecs run-task` using the
   `run_task_network` output (one at a time; each must exit 0):
   `db-admin` (with `db_bootstrap_products` set), `identity-migrate`, `control-migrate`,
   `work-migrate`, `school-migrate`; `school-bootstrap` after `school-migrate` (School's seeds
   and first platform owner; db_admin's network; one-run secret `munaxa-nonprod/school-bootstrap`
   with `PLATFORM_OWNER_EMAIL` and `PLATFORM_OWNER_PASSWORD`, both non-empty, deleted after the
   run; School requires 8 or more characters with an upper-case letter, a lower-case letter and a
   digit, but generate a long one, at least 24 characters, e.g. `openssl rand -base64 24`, never a
   memorable one, because the account is the platform owner; the script never logs the password;
   the seeds have never run from this exact image, so treat the first run as their check and read
   its log before going on);
   `identity-bootstrap` after `identity-migrate` (db_admin's
   network; the owner creates `munaxa-nonprod/identity-bootstrap` with the operator's email and
   password first and deletes it after Identity's steps 1 to 3, which override only the command;
   before deleting it, run the task once more per Work organisation with the command
   `node scripts/seed-work-roles.mjs --organisation <slug>` (the task injects that secret on every
   run), or Work members get 403; give each Work user a `work:*` role with
   `node scripts/bootstrap-account.mjs --role <role>` (seeding defines roles, it assigns none);
   then restart `identity`, which caches role definitions); Work's first tenant: a `work-migrate`
   command override running `bootstrap-tenant.mjs --platform-user-id <sub>`, and the tenant id
   linked in Control as the customer's `tenantRef` with a subscription (munaxa-work
   `deploy/aws/README.md`, "The first tenant on a fresh database");
   then Docs: `docs-db-admin` (db-admin's network; its cluster
   roles, `edms_backup` and the tenant database; it stops if `edms_backup` could reach a non-Docs
   database), then `docs-migrate` (its own security group; exit code 0 required, read from
   `aws ecs describe-tasks`; the `munaxa-docs/migrate` digest from the same release as
   `images.docs_api`), then `docs-provision` (docs-api's security group, after the owner creates
   `munaxa-nonprod/docs-provision/<slug>` and before deleting it). They create clean databases and
   apply the full migration history; no data is copied from Supabase, Render or Docs Production.
4. Control (the licence key's public half is already set, step 0). In the operator portal create the
   deployments for Work, School and Docs, issue one credential each, and write it as
   `CONTROL_PLANE_TOKEN` in that product's bundle (Docs Testing: `munaxa-nonprod/docs-api`).
5. Smoke: `id.*/api/auth/health/ready`; `control-api.*/health/ready` and
   `/api/v1/licensing/public-keys`; `/api/v1/admin/*` on control-api answers 403; the operator
   host shows the Cloudflare Access login without a valid Access session (with `operator_access`
   set, Access decides, not `operator_cidrs`); sign in on `work.*`; School login; a product's
   entitlement request with its credential; logs show no `Entitlements could not be confirmed`.
6. Dispatch `aws-session.yml` → `down`. Do not rely on the schedule: the crons are 19:17 and
   01:47 UTC, but from 30 Oct to 5 Nov GitHub started only one scheduled run a night, up to about
   5.5 hours late. The AWS backstop at 21:00 UTC is the reliable shutdown once it is enabled; finish
   sessions before 19:00 UTC.


### Rollback

| What failed                | Do                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| A new image                | ECS's circuit breaker rolls the service back by itself; then revert the digest PR and apply |
| A migration                | Migrations are additive; fix forward. In Testing, drop and re-create the database (db-admin) |
| Production data            | Restore RDS to a point in time (35 days) into a new instance; switch the URLs                |
| The edge                   | `edge_enabled = false` removes the ALB; DNS still points at the old hosting until G9         |
| Licensing                  | Never relax `LICENSING_MODE` in production; fix the token or Control and redeploy            |

Old hosting (Render, Supabase) stays untouched until G9, so it is the rollback path during the
migration if it is still live.

## Cost (eu-central-1, on-demand prices)

See the migration report for the evidence and the price sources. In brief:

- **Testing, idle:** RDS stopped (20 GB gp3, about US$2.70), KMS 2 keys here plus the state key
  (US$3), 10 bundles plus the RDS master secret (US$4.40), private namespace US$0.50, ECR, logs
  and empty buckets under US$1: **about US$11 to 12 a month** (re-checked 5 Nov 2026, below).
- **Testing, per session hour, every service including Docs (one task each):** Fargate 3 vCPU and
  9 GB about US$0.19, ALB about US$0.035 with LCUs, 12 public IPv4 (10 tasks, 2 ALB) US$0.06, RDS
  micro about US$0.02: **about US$0.30 an hour**, so about 130 session-hours a month fit in US$50
  with the idle cost. Re-checked on 5 Nov 2026 against the AWS Price List files for eu-central-1
  (Fargate US$0.04656 per vCPU-hour and US$0.00511 per GB-hour, ALB US$0.027 an hour, RDS
  `db.t4g.micro` US$0.019 an hour, gp3 US$0.137 per GB-month, secrets US$0.40, keys US$1,
  public IPv4 US$0.005 an hour); details in
  `docs/aws-migration/agent-reports/2026-11-05-testing-readiness/03` §10. The earlier figures were from memory.
- **The account, not just Testing:** Docs Production's idle stack was retired on 4 Nov 2026 (G9 for
  Docs; only its bootstrap and a final snapshot remain). Before that retirement, its idle stack (about US$48 a month) meant the account's US$50 budget (bootstrap) was reached before any Testing session.
- **Production, always on:** about **US$170 a month** with one task per service, about **US$230**
  with two of each API (`prod.tfvars`). Public IPv4 is a quarter of it (US$3.65 per task per
  month). Not within US$50; the production forecast is separate (owner decision of 29 Oct).

## Validation

`terraform fmt -check`, `terraform validate` (both roots) and `terraform test` (14 plan-only runs
with a mocked AWS provider) pass locally; CI runs them and `shellcheck` on every PR. `tflint` and
`actionlint` last ran locally on #24. `db-bootstrap.sh` was
run against PostgreSQL 16. Real nonprod plans ran on 4 and 5 Nov (runs 41887322394 and
41977870108: 64 creates each); none was applied.
