# 01. RDS master secret rotation

Observed 21 Nov 2026 04:23 to 04:24 UTC (07:23 to 07:24 Amman). Metadata-only APIs:
`secretsmanager:DescribeSecret`, `secretsmanager:ListSecretVersionIds` (with `IncludeDeprecated`),
`cloudtrail:LookupEvents`, `rds:DescribeEvents`, `rds:DescribeDBInstances`.
**`GetSecretValue` was not called. No secret value entered context, logs or this report.**

## Secret

| Field | Value |
| --- | --- |
| Name | `rds!db-c3ef5041-5407-4ed4-9a10-0fec0dbe18e5` (ARN suffix `-71cbjT`) |
| Owning service | `rds` (RDS-managed master user secret, no rotation Lambda) |
| RotationEnabled | `true` |
| RotationRules | `AutomaticallyAfterDays: 7` |
| LastRotatedDate | **2026-11-20 21:26:28.280 UTC** (21 Nov 00:26:28 Amman) |
| LastChangedDate | 2026-11-20 21:26:28.292 UTC |
| NextRotationDate | **2026-11-27 23:59:59 UTC** (28 Nov 02:59:59 Amman) |
| KMS key (via the DB MasterUserSecret) | `45eda044…`, status `active` |

## Version stages (metadata only)

| Version id | Stages | Created (UTC) |
| --- | --- | --- |
| `5f35b6a0-ba38-4e7a-b3f1-efbba96ee864` | `AWSCURRENT`, `AWSPENDING` | 2026-11-20 21:25:27 |
| `b04015a3-…` | `AWSPREVIOUS` | 13 Nov rotation |
| `c7f38eac-…` | none (deprecated) | 2026-11-06 |

Checks: exactly one AWSCURRENT **[V]**; exactly one AWSPREVIOUS **[V]**; AWSPENDING present only
on the current version **[V]**; no unexpected version **[V]**.

The AWSPENDING label on the current version was also seen after the 13 Nov rotation (recorded in
the 18 Nov report). RDS-managed rotation appears to leave it in place. That it is harmless is an
**inference**, not something AWS documents in the response.

## CloudTrail rotation activity (eu-central-1, since 20 Nov 00:00 UTC)

- 17 `RotationStarted` events; 16 `RotationFailed` (hourly, 05:08 to 20:25 UTC) while the
  database was stopped **[V]**.
- 21:25:27 UTC: `PutSecretValue` by the RDS service-linked role **[V]**.
- 21:26:28 UTC: `UpdateSecretVersionStage`, `RotationSucceeded`, `CompleteRotation` **[V]**.
- RDS event 21:26:28 UTC on `munaxa-nonprod-pg`: "Reset master credentials" **[V]**.
- `GetSecretValue` events on this secret since 20 Nov: **0** **[V]**.
- `RotateSecret` (manual rotation) events: **0** **[V]**.

## Before and after

| | 19 Nov 21:46 UTC (pre-rotation note) | 21 Nov 04:23 UTC |
| --- | --- | --- |
| LastRotatedDate | 13 Nov | 20 Nov 21:26:28 |
| NextRotationDate | 20 Nov 23:59:59 (shown 21 Nov 00:59:59 by another thread while pending) | 27 Nov 23:59:59 |
| AWSCURRENT | `b04015a3-…` | `5f35b6a0-…` |
| AWSPREVIOUS | older version | `b04015a3-…` |

## Result

**SUCCEEDED.** The conclusion rests on direct evidence (the secret's own metadata changed, the
stage labels moved and CloudTrail recorded `RotationSucceeded`), not on the scheduled date alone.

## Not verified

- That the new password actually authenticates against the database (that would need a
  connection with the secret value, which is out of scope and prohibited).
- Whether the application side caches the old password (nothing is running, so nothing to check).
