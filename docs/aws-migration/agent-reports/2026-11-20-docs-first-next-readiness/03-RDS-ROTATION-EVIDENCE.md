# 03. RDS master secret rotation evidence

**Status: NEEDS VERIFICATION. In progress and retrying, not permanently failed.** Read-only metadata only. No GetSecretValue call, no manual rotation, no RDS start or stop, and no change to the rotation configuration.

## 1. Secret metadata (DescribeSecret, ListSecretVersionIds, 20 Nov about 09:25 UTC) [V]

| Field | Value |
| --- | --- |
| Secret | `rds!db-c3ef5041-5407-4ed4-9a10-0fec0dbe18e5` (RDS-managed master user secret) |
| RotationEnabled | true, every 7 days |
| LastRotatedDate | 13 Nov 2026 17:26:19 UTC |
| NextRotationDate | 21 Nov 2026 00:59:59 UTC (the window that opened on 20 Nov) |
| LastChangedDate | 20 Nov 2026 08:25:31 UTC |
| AWSCURRENT | `b04015a3…` (created 13 Nov 17:25) |
| AWSPREVIOUS | `c7f38eac…` (6 Nov) |
| AWSPENDING | `5f35b6a0-ba38-4e7a-b3f1-efbba96ee864` (listed in DescribeSecret staging labels; not yet returned by ListSecretVersionIds) |

## 2. CloudTrail (LookupEvents, read-only) [V]

| Time (UTC) | Event |
| --- | --- |
| 13 Nov 13:08, 14:25, 15:25, 16:25 | RotationStarted then RotationFailed (DB stopped) |
| 13 Nov 17:26 | **RotationSucceeded** (DB running) |
| 20 Nov 05:08, 06:25, 07:25, 08:25 | RotationStarted then RotationFailed, each "Failed for secret version 5f35b6a0…" |

The pattern repeats 13 Nov exactly. The managed rotation retries about hourly in its window, fails while the instance is stopped, and succeeds once the instance is available.

## 3. Database state [V]

- `munaxa-test-pg` is **stopped**. AutomaticRestartTime is **20 Nov 21:07:07 UTC** (RDS restarts a stopped instance after 7 days).
- That restart comes after today's backstop (21:00 UTC) and R (21:05 UTC). So the DB will most likely run until the next backstop at 21:00 UTC on 21 Nov. That is about 24 hours, roughly US$0.4 [E].
- While it runs, the next hourly retry is expected to finish the rotation (as on 13 Nov).

## 4. Expected outcome and verification

The rotation thread checks at about **00:30 UTC on 21 Nov (03:30 Amman)**. Pass criteria, all from metadata:

- LastRotatedDate after 21:07 UTC on 20 Nov.
- A RotationSucceeded event.
- AWSCURRENT moved to the pending version.
- AWSPENDING cleared.

## 5. If it has not succeeded by then (remediation plan, owner approval needed, not executed)

| Step | Action | Authorization |
| --- | --- | --- |
| R-1 | Re-read metadata and CloudTrail. Confirm the DB is `available` and the reason text of the latest RotationFailed | none (read-only) |
| R-2 | If the DB is available and failures continue: open an AWS Support case with the event ids. Do not rotate by hand | owner |
| R-3 | If the DB was stopped again by the backstop before a retry ran: let the next window retry, or the owner approves a one-off `rotate-secret` on the RDS-managed secret while the DB is up (RDS-managed rotation, no value is read) | owner yes |
| R-4 | Stage E waits until AWSCURRENT is consistent (Identity's db-admin reads the master secret by ARN at run time) | none |

**Stage E dependency:** db-admin uses the master secret through ECS secrets injection, which always reads AWSCURRENT. A pending rotation does not break AWSCURRENT. I still recommend Stage E after the check, as the 19 Nov package did.
