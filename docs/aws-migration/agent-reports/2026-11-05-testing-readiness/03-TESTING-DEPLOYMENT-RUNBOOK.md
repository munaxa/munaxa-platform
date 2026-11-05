# First Testing deployment: plan and runbook

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead. **Status: PROPOSED. Nothing in this runbook has been done.** Every step that changes AWS, GitHub settings, images, secrets or DNS needs the owner's separate approval at the gate named.
- **Environment:** Testing = `nonprod`, account `229251310592`, `eu-central-1`. No production action is in scope.
- **Contract kept:** ECS Fargate in public subnets with public IPv4 and per-service security groups; no NAT gateway; RDS PostgreSQL 16 `db.t4g.micro`; ECR images pinned by digest; Secrets Manager bundles, values never in Git, Terraform, logs or chat; run-only migrations, never on service start (verified: no runtime `CMD` runs a migration; migrations exist only in the `migrate` targets); `LICENSING_MODE=CONTROL_PLANE` for Work, School and Docs; Cloudflare Access on the operator host; on-demand sessions, shut down after validation.
- **Based on:** `infra/aws/README.md` (G1 to G9), `CONTRACT.md`, phase 7 `06` §6 (deployment order) re-checked against the current code (`01` in this folder), with the F-1 to F-4 corrections folded in.

## 1. Dependency order

1. **Shared infrastructure and Testing persistent layer** (G3 + backstop + G6 validation).
2. **Identity** (issuer; Work and Control verify its tokens).
3. **Control API and operator portal** (licence source; behind Cloudflare Access).
4. **First product: Work** (recommended, owner decision D-C).
5. **School, then Docs**, each only after the previous product passed its smoke tests.

Products are added by setting their image digests: a product with no digest in `images` creates no service (services: `count = local.defined.<service> ? 1 : 0`, `services.tf` 92, 292, 509, 562, 602, 674 and `docs.tf` 109; migrate tasks: `for_each … if != ""`, `ops.tf` 166) [V-repo]. So each stage is a small config PR, not a new stack.

## 2. Required pull requests

| # | Repository | PR | Kind | Merge rule |
| --- | --- | --- | --- | --- |
| P-1 | platform | README G7 ordering and Work role step (F-1 to F-4); status lines (this folder) | Docs only | Standing rule (code-only, checks green) |
| P-2 | platform | **G3 declaration**: `stack/envs/nonprod.expected-changes.json` with the 64 addresses of phase 7 `07` | Infrastructure intent | Owner approval (it gates an apply) |
| P-3 | platform | **Backstop**: `session_backstop_schedule = "cron(0 21 * * ? *)"` + 13-create declaration (phase 7 `supporting/backstop/`) | Infrastructure | Owner approval |
| P-4 | platform | **Config A (Identity + Control, services off)**: `images.identity_api`, `identity_migrate`, `control_api`, `control_migrate`, `control_portal` digests; `valkey_image`, `postgres_image`; `operator_access`; `identity_signing_kid`, `identity_public_keys`; `desired_counts` control-api = 0, control-portal = 0; `db_bootstrap_products = ["identity","control"]`; declaration | Infrastructure | Owner approval |
| P-5 | platform | **Secret pins**: `secret_version_ids` for the bundles written | Infrastructure | Owner approval |
| P-6 | platform | **Config B**: `control_licence_public_key` (PEM, public), `control_licence_kid` | Infrastructure | Owner approval |
| P-7 | platform | **Config C**: `control_operator_organisation_id`, `control_operator_subjects`, control-api and control-portal = 1 | Infrastructure | Owner approval |
| P-8 | platform | **Config D (Work)**: `work_api`, `work_migrate`, `work_admin` digests; add `work` to `db_bootstrap_products` | Infrastructure | Owner approval |
| P-9 | platform | **Config E**: re-pin `secret_version_ids` after the real `mxc_` token | Infrastructure | Owner approval |

No product-repository code PR is required for the first session [V-repo, V-gh: all product mains green, no open PRs, GHCR double-trigger removed by identity#6 and work#29].

Every apply of P-2 to P-9 goes through `aws-terraform.yml` (`plan` → read → `apply` in `aws-nonprod`) with **services off**, because the session plan check refuses configuration changes during `up` (F-2).

## 3. Expected resource changes

| Step | Expected plan | Stop condition |
| --- | --- | --- |
| G3 (P-2) | **64 to add, 0 to change, 0 to destroy** (VPC and subnets, S3 gateway endpoint, security groups, RDS PostgreSQL 16 + subnet and parameter groups, KMS data key + alias, 10 secret bundles, ECS cluster, Cloud Map namespace, log groups, buckets, roles; no ALB, no service) | Any other count or address than phase 7 `07`; anything in `prod`; any destroy |
| Backstop (P-3) | 13 to add | Anything other than the 13 addresses |
| Config A (P-4) | Adds task definitions, service and task roles for Identity and Control, the **Control licence KMS key** (`prevent_destroy`) and alias; services at 0 or off. **Exact count: produced by the PR's plan** [U until planned] | Any change to RDS, VPC or bundles; any replace |
| Config B, C, E | In-place task-definition updates only | Any create other than new task-definition revisions |
| Config D (P-8) | Work task definitions, roles, service modules | As A |
| Session `up` | ALB, listeners, target groups, rules, task ingress rules, desired counts; DB start | The session plan check (placement, SG rules) |

## 4. Image publication (G5, owner, per repository)

1. Confirm the `image-release` environment has a required reviewer and only admits `image/*` tags, and that `vars.AWS_IMAGE_PUBLISHER_ROLE_ARN` = `arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-<product>-image-publisher` (bootstrap output `image_publisher_role_arns`).
2. Push `image/<40-hex SHA of the reviewed main commit>`: Identity `5277d71…`, Control `a24c568…`, Work `b490b25…` (or newer reviewed mains). School: push the tag, then dispatch `publish-images-ecr.yml` **from that tag**.
3. Approve the `image-release` job. The publisher may push only to its own `munaxa-<product>/*` repositories.
4. Copy each digest from the run summary into the config PR. Never use a tag in Terraform.

Order: Identity and Control (for P-4), then Work (P-8). School and Docs later.

## 5. Secret bundles (names and keys only; values written by the owner after G3)

| Bundle | Keys | Needed for |
| --- | --- | --- |
| `munaxa-nonprod/identity` | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `REDIS_URL`, `REDIS_PASSWORD` | Identity |
| `munaxa-nonprod/identity-migrate` | `DATABASE_MIGRATION_URL` | Identity |
| `munaxa-nonprod/identity-bootstrap` (one-run, delete after) | `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` | Identity |
| `munaxa-nonprod/control-api` | `DATABASE_URL` | Control |
| `munaxa-nonprod/control-migrate` | `DATABASE_MIGRATION_URL` | Control |
| `munaxa-nonprod/work-api` | `DATABASE_URL`, `PII_MATCH_SECRET`, `CONTROL_PLANE_TOKEN` (placeholder of 20 or more characters, 32 recommended, until step 7.12) | Work |
| `munaxa-nonprod/work-migrate` | `DATABASE_MIGRATION_URL` | Work |
| `munaxa-nonprod/school-api`, `school-migrate`, `school-bootstrap` | see `01` (School) | later |
| `munaxa-nonprod/docs-api`, `docs-operator`, `docs-provision/<slug>` | see `01` (Docs) | later |

Every bundle defined by G3 must hold every key before a task using it starts (ECS refuses a missing key). Database URLs use the `database_endpoint` DNS name exactly, `?sslmode=require`, hex passwords (`openssl rand -hex 32`), roles `<product>_owner` / `<product>_app` (School: `school_owner` / `munaxa_app`).

## 6. DNS (G6, owner, Cloudflare)

1. Within 72 h of G3: `certificate_validation_records` as **DNS only** records (certificate for `*.test.munaxa.com` and `operator-test.munaxa.com`).
2. After the first `up`: CNAMEs to `alb_dns_name`, DNS only, for `id.test`, `control-api.test`, `work.test` (and later `school.test`, `docs.test`); `operator-test.munaxa.com` **proxied** behind the Access application.

## 7. Sequence

Run sessions in daytime UTC and finish before 19:00 UTC: a scheduled `down` (crons 19:17 and 01:47 UTC, which GitHub has run late or skipped) or, after P-3, the 21:00 UTC backstop ends any session still running.

| Step | Action | Gate | Done when |
| --- | --- | --- | --- |
| 7.0 | Decide D-A (B2 diagnostic), D-B, D-C; read tonight's `aws-session.yml` log (trust path) | Owner, lead | Decisions recorded |
| 7.1 | Merge P-1; open P-2; dispatch plan; **owner approves G3 apply**; `down` | G3 | 64 created; post-apply plan no changes |
| 7.2 | G6 validation records | G6 | Certificate issued |
| 7.3 | P-3 backstop plan and apply; verify the first 21:00 UTC run | Separate approval | Scheduler: no target error |
| 7.4 | Cloudflare Access app; Identity key pair; publish Identity and Control images | G5, owner | Digests recorded |
| 7.5 | G4: write identity, identity-migrate, control-api, control-migrate (and placeholders in every other G3 bundle); P-5 pins | G4 | Versions pinned |
| 7.6 | P-4 (Config A) apply, services off → licence key exists; owner reads its public half in CloudShell; P-6 apply | Approvals | `control_licence_public_key` set |
| 7.7 | `up` (Identity starts; Control at 0) → CNAMEs → run-only tasks **one at a time, each must exit 0**: `db-admin` → `identity-migrate` → `control-migrate` → `identity-bootstrap` steps 1 to 3 (keep the `identity-bootstrap` secret until 7.11, or recreate it then) | G7 | All exit 0 |
| 7.8 | `down`; P-7 (operator org and subjects, Control = 1) apply; `up` | Approvals | Control healthy |
| 7.9 | Identity and Control smoke (§8 S-1 to S-6); `down` | G7 | All pass |
| 7.10 | Publish Work images; P-8 apply (services off); write `work-api`, `work-migrate`; pin | G5, G4 | |
| 7.11 | `up`; `db-admin` (with `work`) → `work-migrate` → tenant bootstrap override → `identity-bootstrap` with `seed-work-roles --organisation <slug>` and `bootstrap-account --role <work role>` → delete `identity-bootstrap` secret → restart identity | G7 | All exit 0 |
| 7.12 | Operator portal: create the Work deployment, issue an `mxc_` credential, write it to `work-api` `CONTROL_PLANE_TOKEN`; `down`; P-9 pin; `up` | Owner | |
| 7.13 | Work smoke (§8 S-7 to S-9); **`down`** | G7 | Session closed; DB stopped |

Later: School (S3 bucket, Resend key, DB name, `school-bootstrap`), then Docs (fresh `image/<b8c7e25+>` from the Docs bootstrap publisher, `docs-db-admin`, `docs-provision`).

## 8. Smoke tests

| # | Check | Expected |
| --- | --- | --- |
| S-1 | `https://id.test.munaxa.com/api/auth/health/ready` | 200 |
| S-2 | `https://control-api.test.munaxa.com/health/ready`; `/api/v1/licensing/public-keys` | 200; the KMS public key |
| S-3 | `https://control-api.test.munaxa.com/api/v1/admin/x` and `/API/v1/Admin/x` | 403 (ALB) |
| S-4 | `https://operator-test.munaxa.com/` without Access | Cloudflare Access login; never the portal |
| S-5 | Operator sign-in through Access with MFA | Portal loads; Access log shows the MFA rule matched |
| S-6 | Logs | No secret value, no plan value, no `Entitlements could not be confirmed` for Control |
| S-7 | work-api target group healthy (the ALB checks `/health/ready`; ECS service steady), and `https://work.test.munaxa.com/` (work-admin) | Healthy; 200 or a redirect to sign-in. (On the Work host only `/api/v1/*` reaches work-api, and its health routes sit outside that prefix) |
| S-8 | Sign in on `work.test` with the seeded user | Success; protected route answers 200; a user without the role answers 403 |
| S-9 | A Work entitlement request with the `mxc_` credential | Licensed; with the placeholder token it fails closed (checked before 7.12) |

## 9. Rollback

| Failure | Action |
| --- | --- |
| G3 apply partially fails | Stop. Re-plan; do not destroy without approval. RDS has deletion protection and a final snapshot on destroy |
| New image unhealthy | ECS circuit breaker rolls back; revert the digest PR; apply (services off) |
| A migration fails | Testing only: fix forward, or drop and re-create that product's database through `db-admin` (test data only; nothing copied from Supabase, Render or Docs Production) |
| Control licensing fails | Never relax `LICENSING_MODE`; fix the token or Control and redeploy |
| Cost or safety concern | `aws-session.yml` `down` (ALB and tasks removed, DB stopped); backstop at 21:00 UTC; nightly scheduled `down` |
| Whole Testing layer unwanted | Separately approved `destroy` of `stack/` (RDS final snapshot kept); bootstrap untouched |

Render and Supabase are untouched throughout and remain the fall-back.

## 10. Cost estimates (eu-central-1 on-demand list prices)

**Prices read in this task from the public AWS Price List bulk files** (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<service>/current/eu-central-1/index.json`, publication dates 19 Oct to 2 Nov 2026) [V-price]: Fargate x86 **US$0.04656 per vCPU-hour** and **US$0.00511 per GB-hour**; RDS PostgreSQL `db.t4g.micro` Single-AZ **US$0.019 per hour**; RDS gp3 **US$0.137 per GB-month**; backup beyond the free allocation US$0.103 per GB-month; ALB **US$0.027 per hour**, US$0.008 per LCU-hour; Secrets Manager **US$0.40 per secret-month**; KMS **US$1 per key-month** (not charged while pending deletion, per the KMS pricing page); ECR US$0.10 per GB-month; CloudWatch Logs ingestion US$0.63 per GB, storage US$0.0324 per GB-month. Public IPv4 **US$0.005 per hour** (VPC pricing page, uniform across commercial Regions). Route 53 hosted zone US$0.50 per month. Budgets monitoring free.

**All totals below are estimates [E]** from those prices and the stack's task sizes (`services.tf`, `docs.tf`).

| Scenario | Components | Estimate |
| --- | --- | --- |
| **Today, before G3** | State KMS key US$1, small S3/ECR, Docs bootstrap leftovers, Docs final snapshot (size unknown) | about **US$1 to 4 a month** [E]; actual [U], owner to read Billing |
| **Testing idle after G3 and Config A** (DB stopped, no session; includes the bootstrap state key) | RDS storage 20 GB US$2.74; KMS data + licence + state keys US$3; 10 bundles + RDS master secret US$4.40; Cloud Map zone US$0.50; ECR images (a few GB) under US$1; logs and buckets cents | about **US$11 to 12 a month** |
| **Session hour, stage 1 (Identity + Control)** | Fargate 1.0 vCPU / 2 GB (identity 0.5/1, control-api and portal 0.25/0.5 each) US$0.057; ALB US$0.027 + LCU ~US$0.008; 5 public IPv4 (3 tasks + 2 ALB) US$0.025; RDS US$0.019 | about **US$0.14 an hour** |
| **Session hour, + Work** | adds work-api and work-admin (0.25/0.5 each): +US$0.028 Fargate, +US$0.010 IPv4 | about **US$0.17 an hour** |
| **Session hour, every service incl. School and Docs** | Fargate 3.0 vCPU / 9 GB US$0.186; 12 public IPv4 US$0.06; ALB about US$0.035; RDS US$0.019 | about **US$0.30 an hour** |
| **First deployment, all steps** | About 4 to 6 session hours at US$0.14 to 0.17 | about **US$1 a session day** |
| **Budget headroom** | US$50 Testing budget minus about US$11 idle | about **220 hours** at stage 2 rates, about 130 hours with every service |

**Cost risks:** a session left up overnight (mitigated by the nightly `down` and, after P-3, the 21:00 UTC backstop); RDS restarting itself after 7 days stopped (the nightly schedule stops it again; at most about US$0.46 a day); one-run secrets left in place (US$0.40 a month each); the pre-existing US$10 account budget alerting monthly (TD-13).
