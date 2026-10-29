# Munaxa shared AWS hosting

Terraform for the shared AWS stack that hosts **Munaxa Identity, Control, Work and School** in
`eu-central-1`, per the shared AWS hosting ADR (draft, `/mnt/project-files/aws-next-phase/`).
Munaxa Docs keeps its own Production stack (`munaxa-docs/infra/terraform`) and is not managed here.

**Status: not applied.** Nothing in this directory has created an AWS resource. Every step below
that creates, changes or deletes anything is an owner approval gate (G1 to G9).

## Layout

| Path                     | What                                                                                           | Applied by                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `bootstrap/`             | State bucket and key, ECR repositories, workload boundary, deployer, CI role, image publishers | Root, in AWS CloudShell (as Docs' bootstrap) |
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
        │  control-api.* /api/v1/admin/* ► 403 · /* ► control-api                              │
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
2. `terraform init && terraform plan` and read the plan: about 40 resources (the bucket, a key, 11
   ECR repositories with lifecycle policies, 1 policy, 6 roles and their inline policies). Nothing
   else. Then `terraform apply`.
3. Restore the backend block and run `terraform init -migrate-state`.
4. In GitHub, set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on `munaxa-platform`, and
   `AWS_IMAGE_PUBLISHER_ROLE_ARN` on each product repository (the outputs). They are role names,
   not credentials. Create the environments `aws-nonprod` and `aws-prod` (required reviewer: owner,
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
  `postgresql://<role>:<password>@<database_endpoint>:5432/<database>?sslmode=require`. Role names:
  `identity_owner`/`identity_app`, `control_owner`/`control_app`, `work_owner`/`work_app`,
  `school_owner`/`munaxa_app` (the names each product's migrations grant to).
- **Identity:** `IDENTITY_SIGNING_PRIVATE_KEY` (`pnpm keys:generate` in munaxa-identity; keep the
  existing staging key only if Work tokens signed by it must keep verifying, which nothing needs
  in Testing), `IDENTITY_SIGNING_SECRET`, `REDIS_PASSWORD` and `REDIS_URL`
  (`redis://:<password>@127.0.0.1:6379`). Its public half goes into `identity_public_keys`.
- **Work:** `PII_MATCH_SECRET` (not the development default), `CONTROL_PLANE_TOKEN` (G7 step 4).
- **School:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different), `CONTROL_PLANE_TOKEN`,
  `RESEND_API_KEY` (sending access only).
- Then pin each bundle with `secret_version_ids` in a PR.

### G5. Images

Each product repository's `Publish images to ECR` workflow builds from a tag `image/<40-hex sha>`
on `main`, in the `image-release` environment, and pushes to `munaxa-<product>/<image>`. A PR sets
the digests in `stack/envs/<env>.tfvars` (`images`), with `valkey_image` and `postgres_image` from
`public.ecr.aws` by digest.

### G7. A Testing session

1. Dispatch `aws-session.yml` → `up`. The ALB, listeners and services come up; the database starts.
2. Add CNAMEs in Cloudflare from each host to `alb_dns_name` (DNS only), first session only.
3. Run the db-admin task, then the migrations, in order, with `aws ecs run-task` using the
   `run_task_network` output (one at a time; each must exit 0):
   `db-admin` (with `db_bootstrap_products` set), `identity-migrate`, `control-migrate`,
   `work-migrate`, `school-migrate`. They create clean databases and apply the full migration
   history; no data is copied from Supabase or Render.
4. Control: read the licence key's public half (`aws kms get-public-key`, DER to PEM), set
   `control_licence_public_key` and `control_licence_kid` by PR. In the operator portal create the
   deployments for Work, School and Docs, issue one credential each, and write it as
   `CONTROL_PLANE_TOKEN` in that product's bundle (Docs: `munaxa-docs-eu-prod/app`, docs#165).
5. Smoke: `id.*/api/auth/health/ready`; `control-api.*/health/ready` and
   `/api/v1/licensing/public-keys`; `/api/v1/admin/*` on control-api answers 403; operator host
   answers 403 from outside `operator_cidrs`; sign in on `work.*`; School login; a product's
   entitlement request with its credential; logs show no `Entitlements could not be confirmed`.
6. Dispatch `aws-session.yml` → `down`. The 20:00 UTC schedule does it anyway.

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

- **Testing, idle:** RDS stopped (20 GB gp3, about US$2.70), KMS 3 keys (data, licence, state)
  US$3, 8 bundles US$3.20, private namespace US$0.50, ECR and logs under US$2: **about US$11 a
  month**.
- **Testing, per session hour, every service (one task each):** Fargate 2 vCPU and 4 GB about
  US$0.11, ALB about US$0.03 with LCUs, 9 public IPv4 (7 tasks, 2 ALB) US$0.045, RDS micro about
  US$0.02: **about US$0.21 an hour**, so about 170 session-hours a month fit in US$50 with the idle
  cost.
- **Production, always on:** about **US$170 a month** with one task per service, about **US$230**
  with two of each API (`prod.tfvars`). Public IPv4 is a quarter of it (US$3.65 per task per
  month). Not within US$50; the production forecast is separate (owner decision of 29 Oct).
- **Docs' existing idle stack** (separate) is about US$48 a month on its own until retired (G9).

## Validation

`terraform fmt -check`, `terraform validate` (both roots), `terraform test` (6 plan-only runs with
a mocked AWS provider), `tflint`, `actionlint` and `shellcheck` pass locally. `db-bootstrap.sh` was
run against PostgreSQL 16. No real plan has run: it needs G2.
