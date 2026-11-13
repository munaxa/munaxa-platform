# 02a. Stage R: results (13 Nov 2026, 15:50 to 16:00 UTC)

Legend: **[V]** verified by Claude with a live read-only AWS call, **[E]** expectation or interpretation, **[U]** not verified, **[O]** owner action.

**Status: STAGE R DONE. 12 of 12 checks PASS. No blocker for stage C or P-5. Two new Low findings (S-2, S-3).**

How it ran: after the owner signed in to the AWS MCP connector again (15:49 UTC), Claude ran the list in 02 through the connector (`run_script`, identity `arn:aws:iam::229251310592:root`, the approved development access, ACCESS-POLICY 8 Nov). Every call was a `Describe*`, `List*`, `Get*` metadata read, `HeadObject` or `iam:SimulatePrincipalPolicy`. **No `GetSecretValue`, `BatchGetSecretValue`, `kms:Decrypt`, `ssm:GetParameter*` or `s3:GetObject` was called.** CloudTrail confirms it (R-12).

## Summary

| # | Area | Result |
| --- | --- | --- |
| R-1 | Caller and account | **PASS** |
| R-2 | Terraform backend and state | **PASS** |
| R-3 | Nothing running, database stopped | **PASS** |
| R-4 | Task definitions | **PASS** (still the 5277d71 revisions, as expected before stage D) |
| R-5 | ECR, the two 2db6ed9 digests | **PASS** |
| R-6 | Secrets, metadata only | **PASS** (stage C precondition holds: `AWSCURRENT` is exactly `ad02f18e`) |
| R-7 | IAM effective permissions | **PASS** |
| R-8 | Network and security groups | **PASS** |
| R-9 | Load balancer and target groups | **PASS** (none at rest) |
| R-10 | Certificate and DNS | **PASS** (S-3 noted) |
| R-11 | Backstop, logs, budgets | **PASS** (cost note) |
| R-12 | CloudTrail of the check | **PASS** (S-2 noted) |

## R-1. Caller and account [V]

- `sts:GetCallerIdentity`: account `229251310592`, `arn:aws:iam::229251310592:root`.
- `organizations:DescribeOrganization`: `o-6i2zz7t70i`, management account `229251310592`, feature set ALL.

## R-2. Backend and state [V]

- Bucket `munaxa-shared-tfstate-229251310592`: versioning **Enabled**; default encryption `aws:kms` with key `679d1b6b-…` (alias `munaxa-shared-tfstate`, Enabled, customer managed), bucket key on; all four public access block settings true.
- `nonprod/stack.tfstate` (`HeadObject`, body not read): 244,589 bytes, last modified 2026-11-12 01:34:55 UTC.
- **No lock object** `nonprod/stack.tfstate.tflock`: no plan or apply in progress.
- Six saved plan objects under `nonprod/plans/`, the newest from the 10 Nov apply (run 42766582624).

## R-3. Nothing running [V]

- ECS cluster `munaxa-nonprod` ACTIVE: 0 services, 0 running, 0 pending tasks.
- No load balancer, no target group, no NAT gateway, no Elastic IP.
- `munaxa-nonprod-pg`: **stopped**; PostgreSQL 16.13, `db.t4g.micro`, not publicly accessible, storage encrypted, deletion protection on, single AZ, 7-day backups.

## R-4. Task definitions [V]

Four families, each with exactly one ACTIVE revision, all registered 10 Nov 06:10 UTC (Config A1):

| Family | Image | Pinned secret versions |
| --- | --- | --- |
| `munaxa-nonprod-identity:1` | `munaxa-identity/api@sha256:71d01fdf…` + Valkey sidecar `public.ecr.aws/valkey/valkey@sha256:757b7e55…` | 5 keys of `munaxa-nonprod/identity` at `ad02f18e` |
| `munaxa-nonprod-identity-migrate:1` | `munaxa-identity/migrate@sha256:d175ef37…` | `identity-migrate` at `a3cc6622` |
| `munaxa-nonprod-identity-bootstrap:1` | `munaxa-identity/api@sha256:71d01fdf…` | `identity-migrate` at `a3cc6622`; the one-run `identity-bootstrap` secret (created per run) |
| `munaxa-nonprod-db-admin:1` | PostgreSQL client | RDS master secret (unpinned, RDS-managed); `IDENTITY_APP_URL` at `ad02f18e`; `IDENTITY_OWNER_URL` at `a3cc6622` |

No task role on any of them. Execution roles `munaxa-nonprod-{identity,identity-migrate,identity-bootstrap,db-admin}-execution`. No other family carries an Identity image. Definitions hold only ARNs, no value. This is the state stage D replaces (06): it confirms the db-admin dependency on the `identity` bundle version.

## R-5. ECR [V]

| Repository | Digest | Tags | Pushed | Scan |
| --- | --- | --- | --- | --- |
| `munaxa-identity/api` | `sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b` | `2db6ed9`, `sha-2db6ed9bb2eec55a38a1d9808b4a51f6258662d8` | 13 Nov 03:36:43 UTC | COMPLETE, 0 findings |
| `munaxa-identity/migrate` | `sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874` | the same two | 13 Nov 03:36:57 UTC | COMPLETE, 0 findings |

Both repositories: `IMMUTABLE` tags, scan on push, AES256 encryption. The digests equal PR #121's pins (03).

## R-6. Secrets, metadata only [V]

| Secret | Versions | Stages | KMS key | Rotation |
| --- | --- | --- | --- | --- |
| `munaxa-nonprod/identity` (`…-sn5umm`) | **1**: `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a`, created 9 Nov 13:46 UTC | `AWSCURRENT` | `45eda044-…` (alias `munaxa-nonprod-data`) | none |
| `munaxa-nonprod/identity-migrate` (`…-tv3PAq`) | 1: `a3cc6622-df66-4787-bae7-83ccfec56ff4`, 9 Nov 13:47 UTC | `AWSCURRENT` | the same | none |
| `munaxa-nonprod/identity-operator` | **does not exist** | — | — | — |

- `munaxa-nonprod/identity-operator` is absent, as expected: it is not a Terraform resource; Option A creates it inside AWS during the first session (runbook 03, stage E) [V repository].
- `docs-migrate` is absent: it is the pending create in the stage D plan (06).
- All 11 secrets in the account/region: `munaxa-nonprod/` `identity`, `identity-migrate`, `control-api`, `control-migrate`, `work-api`, `work-migrate`, `school-api`, `school-migrate`, `docs-api`, `docs-operator`, and the RDS-managed `rds!db-c3ef5041-…`. No `identity-bootstrap` secret at rest (one-run, as designed).
- **Stage C precondition holds:** `AWSCURRENT` is exactly `ad02f18e`, the only version. After stage C it becomes `AWSPREVIOUS`, as 04 §3 step 5 describes.
- The JSON key names inside the bundle were not read (that needs the value). "No `MFA_ENCRYPTION_KEYS` yet" stays an inference [E]; the stage C script checks it itself.

## R-7. IAM [V]

- The three Identity execution roles (path `/munaxa-shared/`): trust only `ecs-tasks.amazonaws.com` with `aws:SourceAccount = 229251310592`; one inline policy `execution`; no attached managed policy; permissions boundary `arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary` (default version v3). Statements equal `modules/service/main.tf` and `ops.tf`: ECR pull of their own repository only, logs to their own group, `GetSecretValue` on their own bundle only, `kms:Decrypt` on the data key only through Secrets Manager.
- The db-admin role reads the RDS master secret and the nine service/migrate URL bundles, as in code.
- `SimulatePrincipalPolicy` (context `aws:RequestedRegion = eu-central-1`; for KMS also `kms:ViaService` and the key's tags):

| Role | Own bundle | Other bundles, `identity-operator` | `PutSecretValue` | Own ECR repo | Other ECR repo | `kms:Decrypt` data key |
| --- | --- | --- | --- | --- | --- | --- |
| identity-execution | allowed | denied | denied | allowed (`api`) | denied | allowed |
| identity-migrate-execution | allowed | denied | denied | allowed (`migrate`) | denied | allowed |
| identity-bootstrap-execution | allowed (`identity-migrate`, `identity-bootstrap-*`) | denied (`identity`, `identity-operator`) | denied | allowed (`api`) | denied | allowed |

Two simulator notes, not findings: without `aws:RequestedRegion` every call shows `explicitDeny` from the boundary's `ThisRegionOnly` (a missing key counts as "not equal"); and the boundary's `OwnKeys` needs the key's tags, which the simulator only sees when given (the key carries `Environment=nonprod`, `Project=munaxa`, read with `kms:ListResourceTags`).

- **Data KMS key** `45eda044-…`: Enabled, customer managed, symmetric, yearly rotation on. Its key policy has two statements: account administration (`arn:aws:iam::229251310592:root`, `kms:*`, which delegates to IAM) and CloudWatch Logs for `/munaxa/nonprod/*`. So the owner's root principal can use it through Secrets Manager: **no key-policy blocker for stage C route M-1** (04 §7 [U] is now [V]).

## R-8. Network [V]

- VPC `munaxa-nonprod` `10.130.0.0/16`. Subnets: public `10.130.0.0/24` (a), `10.130.1.0/24` (b); database `10.130.64.0/24` (a), `.65` (b), `.66` (c). No subnet maps public IPs on launch.
- Route tables: database = local only; public = local, `0.0.0.0/0` to the internet gateway, S3 prefix list to the S3 gateway endpoint; main = local only. The only VPC endpoint is the S3 gateway. The only network interface is the RDS one.
- Security group rules (all 13):
  - `identity`: in 4001 from `alb` only; out 443 to `0.0.0.0/0`, out 5432 to `database`.
  - `identity-migrate`: out 5432 to `database`, out 443.
  - `db-admin`: out 5432 to `database`, out 443; no inbound.
  - `database`: in 5432 from `identity`, `identity-migrate`, `db-admin` only.
  - `alb`: in 443 and 80 from `0.0.0.0/0` (80 is the HTTP-to-HTTPS redirect listener, `edge.tf`), out 4001 to `identity`.
  - `default`: no rules.
- No `0.0.0.0/0` ingress except the ALB group's, and no ALB exists at rest.

## R-9. Load balancer and target groups [V]

None (`DescribeLoadBalancers`, `DescribeTargetGroups` empty). They are session resources.

## R-10. Certificate and DNS [V]

- ACM: one certificate, `*.test.munaxa.com` + `operator-test.munaxa.com`, **ISSUED**, Amazon issued, valid until **22 May 2027**, in use by nothing.
- Route 53: one hosted zone, `nonprod.munaxa.internal.` (the private service-discovery zone, `services.tf:83`). No public zone: public DNS is Cloudflare.
- The `id.test.munaxa.com` lookup is left to stage E (02, DNS-H1).
- **S-3 (Low):** ACM shows `RenewalEligibility = INELIGIBLE` because the certificate is attached to nothing between sessions; ACM renews only certificates in use. Renewal around April 2027 therefore depends on a session running near that time, or on re-issuing. A note for later, nothing to do now.

## R-11. Backstop, logs, budgets [V]

- EventBridge Scheduler, group `default`: 11 schedules, **all ENABLED**, `cron(0 21 * * ? *)` UTC, role `munaxa-shared/munaxa-nonprod-session-backstop`: `munaxa-nonprod-backstop-database` (`rds:StopDBInstance munaxa-nonprod-pg`) and one `ecs:UpdateService DesiredCount 0` each for `identity`, `control-api`, `control-portal`, `work-api`, `work-admin`, `school-api`, `school-admin`, `docs-api`, `docs-web`, `docs-scanner`.
- Log groups `/munaxa/nonprod/identity`, `identity-migrate`, `ops`: 14-day retention, empty, no KMS key (as in code).
- Budgets (month to date): `munaxa-shared-testing-monthly` $1.91 of $50; `munaxa-shared-account-monthly` $9.55 of $50; `munaxa-docs-eu-prod-monthly` $5.41 of $10; **`munaxa-account-monthly` $9.55 of $10 (96 %)**. The last one is the older account-wide $10 budget; it will alert this month. Its alert is expected and harmless while the $50 budgets are the binding ones (29 Oct decisions); retiring or raising it is an owner housekeeping choice, not part of this task.

## R-12. CloudTrail of the check [V]

`LookupEvents`, 14:54 to 15:54 UTC (the window that had reached CloudTrail then):

- **Write events: 3, none by a person or by this session.** All are the RDS-managed rotation of the RDS master secret `rds!db-c3ef5041-…`: `RotationStarted` 15:25:15, `RotationFailed` 15:25:20 (both by `secretsmanager.amazonaws.com`), `CompleteRotation` 15:25:20 (by `rds.amazonaws.com`).
- **`GetSecretValue` / `BatchGetSecretValue` events: 0.**
- Error codes in read-only events: 0 (the only errors this check met were the expected `ResourceNotFoundException` for `identity-operator` and one `NoSuchEntity` for a wrong boundary path, corrected).
- 56 read-only events: this check's reads (ECS, ECR, ELB, RDS, S3, Secrets Manager metadata, STS, KMS), the owner's own console session (14:49 to 14:56, `DescribeRegions`, notification hubs), and AWS service principals (CloudTrail `GetBucketAcl` on its trail bucket, Resource Explorer, RDS). Global IAM calls are logged in us-east-1 and later calls had not yet been delivered; they were all reads.

**S-2 (Low, operational).** The RDS-managed master secret rotates every 7 days (last 6 Nov 16:09). Today's rotation **failed** because the database is stopped. The secret now has `AWSCURRENT` `c7f38eac-…` and a leftover `AWSPENDING` `b04015a3-…`; next attempt 14 Nov 00:59 UTC, which will fail again while the database stays stopped. Impact [E]: none at rest; `AWSCURRENT` is unchanged and db-admin reads the master secret unpinned. Before stage E (after the database starts), check `DescribeSecret` on that secret: if `AWSCURRENT` and the database disagree, db-admin cannot sign in. Neither RDS nor Secrets Manager is changed by this task.

## What this changes

- Stage R gate: **done**. Owner action O-1 (sign in again) is done.
- Stage C: preconditions confirmed live (pinned version is `AWSCURRENT`, key policy allows root, the account and region). The route choice (M-1 or M-3) is still the owner's.
- P-5 (PR #121): unchanged, still draft, still waiting for the stage C version id.
