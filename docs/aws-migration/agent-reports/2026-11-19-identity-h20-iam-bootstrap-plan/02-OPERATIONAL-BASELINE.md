# 02. Live operational baseline, H-20 gate, monitoring and risks (19 Nov 2026)

**Access.** AWS connector, signed in as root of `229251310592` (owner-approved development access), region `eu-central-1`. IAM, Budgets and ACM read their global endpoints where needed.

**Calls made** (all read-only, 08:56–09:05 UTC):
- `sts:GetCallerIdentity`;
- `rds:DescribeDBInstances`;
- `secretsmanager:DescribeSecret` (metadata only, never the value);
- `ecs:ListServices` and `ecs:ListTasks`;
- `elbv2:DescribeLoadBalancers`;
- `states:DescribeStateMachine`, `states:ListExecutions` and `states:DescribeExecution`;
- `scheduler:ListSchedules` and `scheduler:GetSchedule`;
- `cloudwatch:DescribeAlarms`;
- `sns:GetTopicAttributes`;
- `acm:ListCertificates` and `acm:DescribeCertificate`;
- `budgets:DescribeBudgets`;
- `iam:GetPolicy`, `iam:GetPolicyVersion` and `iam:ListPolicyVersions`;
- `s3:HeadObject` (bootstrap state and lock).

No write. No workflow dispatched. No execution started.

## 1. Baseline (current, 19 Nov 2026 08:56 UTC unless stated)

| Check | Result | Status |
| --- | --- | --- |
| Account / caller / region | `229251310592`, root, `eu-central-1` | VERIFIED LIVE |
| Testing database `munaxa-nonprod-pg` | `stopped` | VERIFIED LIVE |
| ECS cluster `munaxa-nonprod` | 0 services, 0 tasks | VERIFIED LIVE |
| Load balancers | none in the region | VERIFIED LIVE |
| Cleanup state machine | `ACTIVE`, `STANDARD` | VERIFIED LIVE |
| Executions | 2 in total, both SUCCEEDED, none RUNNING: `dry-run-idle-20261119T0345` (D-B4, 03:45:34–03:45:36 UTC) and R `1a6afe12-…` (18 Nov 21:05:22–21:05:23 UTC) | VERIFIED LIVE |
| Latest **real** success | R `1a6afe12-fcc7-48a0-bad9-043f5c61bd30`, stopped 18 Nov 21:05:23 UTC, input exactly `{"dryRun":false}` | VERIFIED LIVE |
| R schedule `munaxa-nonprod-session-cleanup-daily` | `ENABLED`, `cron(5 21 * * ? *)` UTC, target the state machine, role `munaxa-shared/munaxa-nonprod-session-backstop`, input `{"dryRun":false}` | VERIFIED LIVE |
| Alarms | `-failed` OK since 18 Nov 08:35:08 UTC; `-not-run` OK since 18 Nov 22:06:11 UTC. One alarm action each (the alert topic) | VERIFIED LIVE |
| Backstop schedules | 11 `ENABLED`: `munaxa-nonprod-backstop-database` and one per service (identity, control-api, control-portal, work-api, work-admin, school-api, school-admin, docs-api, docs-web, docs-scanner) | VERIFIED LIVE |
| Obsolete P/S schedules | none (12 `munaxa-nonprod-*` schedules in total: 11 backstop and R) | VERIFIED LIVE |
| Live IAM against the D-B2R code | boundary, session-read (v3, updated 18 Nov 13:36:54 UTC, 3 stored versions) and session-cleanup are **equal** after normalization. `GateSessionCleanup` is **absent** | VERIFIED LIVE |
| Bootstrap state | `bootstrap/terraform.tfstate` last modified 18 Nov 13:36:56 UTC (the D-B2R apply), SSE-KMS. Lock object absent (404) | VERIFIED LIVE |

## 2. H-20 gate, read-only (08:56:05 UTC)

The gate was run as the connector gate's `gate` mode: the same `gate()` code, with the `arm` and `disarm` paths left out. No `hard_stop_utc`, so this is a pre-session check. It returned **FAIL**:

| Condition | Result |
| --- | --- |
| `state_machine_active` | true |
| `succeeded_within_26h` | true |
| `last_success_was_real` | **false**: the latest success is `dry-run-idle-20261119T0345` |
| `none_running` | true |
| `daily_enabled` | true |
| `alarms_present` | true |
| `alarms_not_in_alarm` | true (both OK) |
| `no_stale_session_schedules` | true (none) |

**Assessment.**
- This is the expected effect of the owner-approved D-B4 dry run, noted before it ran (report 2026-11-18, file 17 §5).
- It clears when R succeeds at 21:05 UTC tonight. R takes about 1 s, and `not-run` evaluates hourly.
- The workflow's two per-session conditions, `hard_stop_utc` and `own_session_armed`, can only pass for a real session with armed P and S.
- **The GitHub workflow gate would also fail today for a second reason:** the session role lacks the two reads that this plan adds.

## 3. Scheduled Testing `down`

| Run | Time (UTC) | Result |
| --- | --- | --- |
| 44435648783 (`a976b1a`) | 19 Nov 01:16–01:17 | **success**. "Stop the database" job success; "Testing down" job: init, **Plan the switches success**, Apply the switches success, Stop the database success |
| 44274042137 (`3453f13`) | 18 Nov 09:14 (historical) | failure at "Plan the switches" (`states:ListStateMachineVersions`), fixed by D-B2R |

**Verified (GitHub):** the D-B2R fix works in operation. The scheduled 10:00 UTC check from the previous round is no longer needed.

## 4. Monitoring and risks

| Item | Current evidence | Assessment |
| --- | --- | --- |
| Scheduled cleanup R | Enabled. Last real run SUCCEEDED 18 Nov 21:05 UTC. Next run 19 Nov 21:05 UTC | OK |
| Scheduled `down` | Last run succeeded (§3) | OK |
| `-failed` / `-not-run` alarms | Both OK (§1) | OK |
| SNS `munaxa-nonprod-session-cleanup-alerts` | 1 confirmed, 0 pending (alert@munaxa.com, D-B5, 19 Nov 03:46 UTC). Re-read at 08:56 UTC | OK |
| RDS master secret (metadata only) | Rotation enabled. Last rotated 13 Nov 17:26 UTC. Next rotation **20 Nov 23:59:59 UTC**. Stages: one version `AWSCURRENT,AWSPENDING`, one `AWSPREVIOUS` | **Open risk, unchanged.** AWSPENDING still sits on the current version. Watch the 20 Nov rotation while the database is stopped; it may fail and need a manual retry with the database started. No action taken |
| Test certificate `*.test.munaxa.com` | ISSUED, renewal `INELIGIBLE`, not in use (0), valid until 22 May 2027 | Open, low. Not in use while no ALB exists. Eligible again once attached to an ALB and the DNS validation records stay in place |
| Budgets (actual, November) | `munaxa-account-monthly` **11.906 / 10.0 USD (over)**; `munaxa-shared-account-monthly` 11.906 / 50; `munaxa-shared-testing-monthly` 3.518 / 50; `munaxa-docs-eu-prod-monthly` 5.913 / 10 | **Open.** The legacy 10 USD account budget is over, and its alert has fired. The shared budgets are well inside. No change made |
| picomatch GHSA-fc5q-39xc-vjpf | `npm view picomatch version` = **4.0.7** (19 Nov), still affected; no patched release. Exception in `docs/security-platform/AUDIT-EXCEPTIONS.md` unchanged | Open, accepted by the owner on 18 Nov (development tooling only) |
| Inherited B-H1 and R-7 | Unchanged since report 2026-11-18 file 15 | Open |

**Historical, for context only:** R's first real run (18 Nov 21:05 UTC), the D-B5 subscription and the D-B4 dry run (19 Nov 03:43–03:46 UTC) are recorded in report 2026-11-18 file 17.
