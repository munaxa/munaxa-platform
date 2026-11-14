# 02. Current AWS state, read-only verification

**Result: VERIFIED, 14 Nov 2026 20:36–20:40 UTC.** Nothing runs; the four revision 2 task definitions are registered; revision 1 is kept; the database is stopped; the only writes since the stage D apply are the six planned ones.

## Access

| Time (UTC, 14 Nov) | Event |
| --- | --- |
| about 12:10, 12:16, 17:0x, 20:30 | the AWS connector refused every call ("needs you to sign in again"); nothing was read; no workaround was used |
| 20:35 | owner: "its connected now" |
| 20:36 | `sts:GetCallerIdentity`: account **`229251310592`**, `arn:aws:iam::229251310592:root` (the owner-approved development access, ACCESS-POLICY 8 Nov) |

All calls below are Describe, List, Get or Lookup calls through the connector, in `eu-central-1` unless stated. No `GetSecretValue`.

## A. ECS (cluster `munaxa-nonprod`) [V]

| Check | Result |
| --- | --- |
| Cluster | `ACTIVE`; `activeServicesCount` 0, `runningTasksCount` 0, `pendingTasksCount` 0 |
| Services | `ListServices`: **0** |
| Tasks | `ListTasks` RUNNING: **0**; STOPPED: **0** (ECS keeps stopped tasks for about an hour, so this shows no task stopped recently, not all history) |
| Task-definition families (prefix `munaxa-nonprod`, ACTIVE) | 4: `db-admin`, `identity`, `identity-bootstrap`, `identity-migrate`; each has ACTIVE revisions **1 and 2** |

Latest revision of each family (no values; image digest prefix, secret name and version id prefix only):

| Family | Revision, registered | Image | Secret references | Environment checked |
| --- | --- | --- | --- | --- |
| `munaxa-nonprod-identity` | **2**, 13 Nov 21:45:11 | `identity`: `sha256:9a8c6ebdc9a5…` (2db6ed9 api); `valkey`: `sha256:757b7e559b14…` | `DATABASE_URL`, `IDENTITY_SIGNING_PRIVATE_KEY`, `IDENTITY_SIGNING_SECRET`, `MFA_ENCRYPTION_KEYS`, `REDIS_PASSWORD`, `REDIS_URL` (identity), `REDIS_PASSWORD` (valkey): all `munaxa-nonprod/identity` at version **`80914756`** | `MFA_POLICY=off`, `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11`, `IDENTITY_PASSWORD_RESET=disabled`, `NODE_ENV=production` |
| `munaxa-nonprod-identity-migrate` | **2**, 21:45:11 | `sha256:5f3bdcce0bef…` (2db6ed9 migrate) | `DATABASE_MIGRATION_URL`: `munaxa-nonprod/identity-migrate` at `a3cc6622` | `NODE_ENV=production` |
| `munaxa-nonprod-identity-bootstrap` | **2**, 21:45:11 | `sha256:9a8c6ebdc9a5…` (api) | `DIRECT_DATABASE_URL` at `a3cc6622`; `IDENTITY_OWNER_EMAIL`, `IDENTITY_OWNER_PASSWORD` from `munaxa-nonprod/identity-bootstrap` (no version pin; that secret does not exist yet, see C) | `NODE_ENV=production` |
| `munaxa-nonprod-db-admin` | **2**, 21:45:11 | `sha256:5983db9a9c6a…` (PostgreSQL client) | `IDENTITY_APP_URL` at `80914756`; `IDENTITY_OWNER_URL` at `a3cc6622`; `PGUSER`, `PGPASSWORD` from the RDS-managed master secret | — |

**No Identity, migration, bootstrap or db-admin task is running.** The task definitions are registered only.

## B. RDS (`munaxa-nonprod-pg`) [V]

| Check | Result |
| --- | --- |
| Status | **`stopped`**; `db.t4g.micro`; deletion protection on; master user secret `active` |
| Events since 13 Nov 12:00 | 16:26:50 started by RDS (7-day stopped limit); 16:26–16:34 recovery, restart, backup; 17:26:19 "Reset master credentials" (rotation); **21:07:07 "DB instance stopped"**. No event after that |
| Backstop | 11 EventBridge Scheduler schedules `munaxa-nonprod-backstop-*` (database and 10 services), all **ENABLED**. The last stop it made: 13 Nov 21:00:48 (stage D report 03). The database has stayed stopped since 21:07 on 13 Nov, so the 14 Nov scheduled `down` runs had nothing to stop. The 14 Nov 21:00 run had not happened at the time of the read |

## C. Secrets Manager (metadata only) [V]

| Secret | Result |
| --- | --- |
| `munaxa-nonprod/identity` | created 5 Nov 22:46; last changed **13 Nov 19:40:16** (stage C); versions: **`80914756-68cd-420d-8094-0fd49afe3492` AWSCURRENT** (created 13 Nov 19:40:16), `ad02f18e-…` AWSPREVIOUS (9 Nov); no deletion date; KMS key `…45eda044…` (`alias/munaxa-nonprod-data`) |
| `munaxa-nonprod/docs-migrate` | created **13 Nov 21:45:09** (stage D); **0 versions** (no value); never accessed; same KMS key; no deletion date |
| Names starting `munaxa-nonprod/identity` (including planned deletion) | `munaxa-nonprod/identity`, `munaxa-nonprod/identity-migrate`. **`identity-operator` and `identity-bootstrap` do not exist** (created only in stage E) |
| RDS master secret | rotation enabled; last rotated 13 Nov 17:26:19; next **20 Nov 23:59:59**; 2 versions holding `AWSCURRENT`, `AWSPREVIOUS` and **`AWSPENDING`** (S-2: a pending version from a failed rotation while stopped is still there) |

No secret value, key material or credential was read or returned.

## D. CloudTrail (management write events since 13 Nov 21:40 UTC) [V]

`LookupEvents` with `ReadOnly=false`. Names, times, callers, error codes and resource names only.

| Region | Time (UTC) | Event | Caller | Error | Resource |
| --- | --- | --- | --- | --- | --- |
| eu-central-1 | 13 Nov 21:45:09 | `CreateSecret` | `munaxa-shared-deployer-nonprod/gha-run-43513076111` | — | `munaxa-nonprod/docs-migrate` |
| eu-central-1 | 21:45:11 | `RegisterTaskDefinition` ×4 | same | — | `identity:2`, `identity-migrate:2`, `identity-bootstrap:2`, `db-admin:2` |
| us-east-1 | 21:45:10 | `PutRolePolicy` | same | — | `munaxa-nonprod-docs-db-admin-execution` / `execution` |
| us-east-1 | 21:47:02, 21:47:10 | `CallReadWriteTool` (`aws-mcp`) | root | — | — |
| us-east-1 | 14 Nov 17:00:13, 17:00:31, 20:28:12 | `ConsoleLogin` (`signin`) | root | — | — |

- **The only resource writes since the apply are the six stage D changes.** None failed.
- `CallReadWriteTool` is the AWS MCP connector's own audit record of a tool call (the stage D post-apply verification at 21:46–21:48). It is not a resource change.
- `ConsoleLogin` events are the owner's sign-ins when reconnecting the connector.
- No `RunTask`, `StartTask`, `CreateService`, `UpdateService`, `StartDBInstance`, `PutSecretValue`, IAM, KMS, network or DNS write. No unexpected change.

## F. Other cost-relevant state [V]

| Check | Result |
| --- | --- |
| Load balancers | 0 |
| NAT gateways (available, pending) | 0 |
| Elastic IPs | 0 |
| Certificate `*.test.munaxa.com` | `ISSUED`, not after 2027-05-22, renewal `INELIGIBLE`, in use by 0 |
| CloudWatch alarms (eu-central-1, us-east-1) | none defined |
| EventBridge rules | none (the backstop uses EventBridge Scheduler) |

Budgets are in 03.

## GitHub evidence (supporting)

The scheduled `down` runs of 14 Nov 00:21 and 08:06 planned "No changes" with sessions off and reported the database `stopped` (03). This agrees with the direct reads above.
