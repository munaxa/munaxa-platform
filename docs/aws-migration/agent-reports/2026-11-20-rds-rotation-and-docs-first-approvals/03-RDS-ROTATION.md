# 03. RDS master secret rotation

**Status: NEEDS VERIFICATION. Post-rotation result PENDING until 21 Nov 2026 00:30 UTC (03:30 Amman).**

Read-only metadata only, through the root connector, 20 Nov 2026 about 18:22 to 18:40 UTC: `DescribeDBInstances`, `DescribeSecret`, `ListSecretVersionIds`, `cloudtrail LookupEvents`, `rds DescribeEvents`. No `GetSecretValue`, no `RotateSecret`, no RDS start or stop, no label change. (No `aws-secrets-manager` skill exists in the AWS skill registry; the CLAUDE.md secret rules were followed directly.)

## 1. Database [V]

| Field | Value |
| --- | --- |
| Instance | **`munaxa-nonprod-pg`** (db.t4g.micro, PostgreSQL 16.13, created 6 Nov 16:11 UTC) |
| Status | `stopped` |
| AutomaticRestartTime | **20 Nov 2026 21:07:07 UTC** (21 Nov 00:07 Amman) |
| Master user secret | `rds!db-c3ef5041-5407-4ed4-9a10-0fec0dbe18e5` (RDS-managed) |
| RDS events since 20 Nov 00:00 UTC | none |

`munaxa-test-pg`, used in the morning report, does not exist (DBInstanceNotFound); it is the mocked hostname in the offline Terraform harnesses.

## 2. Secret metadata [V]

| Field | Value |
| --- | --- |
| RotationEnabled | true, every 7 days |
| LastRotatedDate | 13 Nov 2026 17:26:19 UTC |
| NextRotationDate | 21 Nov 2026 00:59:59 UTC |
| LastChangedDate | 20 Nov 2026 17:25:28 UTC (the latest failed attempt) |
| AWSCURRENT | `b04015a3-4fe5-4a31-9d41-43d0b9fd59d5` (created 13 Nov 17:25 UTC) |
| AWSPREVIOUS | `c7f38eac-8457-4f8c-a49f-673f1fc17fde` (6 Nov) |
| AWSPENDING | `5f35b6a0-ba38-4e7a-b3f1-efbba96ee864` (in `VersionIdsToStages`; `ListSecretVersionIds` still lists only the two versions above) |

## 3. CloudTrail, 20 Nov [V]

13 `RotationStarted` events, each followed about 5 s later by `RotationFailed` "Failed for secret version 5f35b6a0-…": 05:08, 06:25, 07:25, 08:25, 09:25, 10:25, 11:25, 12:25, 13:25, 14:25, 15:25, 16:25, 17:25 UTC, and no `RotationSucceeded` or `RotationAbandoned`.

This is the 13 Nov pattern exactly: hourly retries fail while the instance is stopped; on 13 Nov the first retry after the instance became available succeeded (17:26 UTC).

## 4. What is expected tonight

| UTC | Amman | Expected event |
| --- | --- | --- |
| 21:00 | 00:00 | AWS backstop stop (instance already stopped: nothing to do) |
| 21:05 | 00:05 | cleanup R (idle: no write) |
| 21:07 | 00:07 | RDS auto-start; `available` a few minutes later |
| 21:25, 22:25, 23:25, 00:25 | 00:25 to 03:25 | hourly retries with the instance available; the first is expected to succeed |
| **00:30** | **03:30** | **read-only verification (this file, §5)** |
| about 01:15 to 01:45 | about 04:15 to 04:45 | scheduled GitHub `down` (cron 19:17 UTC, observed starting 01:16 to 01:40 UTC on 18 to 20 Nov) stops the database |

Correction to PR #145: the database runs about 4 to 4.5 hours, not about 24 hours, because the late-running scheduled `down` stops it. If GitHub drops that run, the 21:00 UTC backstop on 21 Nov stops it.

## 5. Verification procedure at or after 00:30 UTC (read-only)

| # | Read | Pass |
| --- | --- | --- |
| V-1 | `DescribeDBInstances munaxa-nonprod-pg` | was `available` after 21:07 UTC (now `available` or `stopping`/`stopped` by the scheduled down) |
| V-2 | `LookupEvents` `RotationSucceeded` since 21:00 UTC | exactly one event after 21:07 UTC |
| V-3 | `DescribeSecret` | `LastRotatedDate` after 21:07 UTC; `VersionIdsToStages` has AWSCURRENT on `5f35b6a0…`, AWSPREVIOUS on `b04015a3…`, **no AWSPENDING** |
| V-4 | `ListSecretVersionIds` | `5f35b6a0…` listed with AWSCURRENT |
| V-5 | `LookupEvents` `RotationFailed` after the success | none |
| V-6 | `NextRotationDate` | moved to about 28 Nov |

All six pass: **VERIFIED COMPLETE**, and Stage E precondition P-1 is met.

## 6. If it has not succeeded (remediation proposal; owner approval needed; nothing executed)

| Case | Diagnosis (metadata and logs only) | Proposal | Authorization |
| --- | --- | --- | --- |
| Instance never became `available` | `DescribeDBInstances`, RDS events | wait for the next 7-day restart, or owner approves a one-off start for the rotation window | owner yes (RDS start) |
| Instance available, attempts still `RotationFailed` | event times vs. availability; `errorMessage`; RDS events | AWS Support case with the event ids; do not rotate by hand | owner |
| Instance stopped by the scheduled `down` before any retry | run start time vs. retry times | let the next window retry, or owner approves `RotateSecret` on the RDS-managed secret while the instance is up (no value read) | owner yes |

In every case AWSCURRENT `b04015a3…` stays the valid password (a failed managed rotation does not move AWSCURRENT), so nothing in Testing breaks. Stage E still waits for V-1 to V-6.
