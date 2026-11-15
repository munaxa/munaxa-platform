# 03. Scheduled workflow, backstop and cost status

## Scheduled Testing `down` runs (`aws-session.yml`, event `schedule`)

| Run | Started (UTC) | Commit | Conclusion | "Plan the switches" | "Start the database" | "Apply the switches" | Database stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [43396042072](https://github.com/munaxa/munaxa-platform/actions/runs/43396042072) | 13 Nov 08:47 | `b2d93aa` (before stage D) | **failure** | failed (S-1) | — | — | worked (separate job) |
| [43533662116](https://github.com/munaxa/munaxa-platform/actions/runs/43533662116) | 14 Nov 00:21 | `68fa6f9` | **success** | success: **No changes** (0/0/0/0) | skipped | success, `Session down applied.` (no-op) | `database munaxa-nonprod-pg: stopped` (both jobs) |
| [43574175677](https://github.com/munaxa/munaxa-platform/actions/runs/43574175677) | 14 Nov 08:06 | `68fa6f9` | **success** | success: **No changes** (0/0/0/0) | skipped | success (no-op) | `database munaxa-nonprod-pg: stopped` (both jobs) |

[G] from the job logs (jobs 132257279172, 132257278931, 132384684102, 132384684379).

- **The switch plan succeeds again after stage D.** S-1 is resolved.
- **No scheduled run attempted to start anything.** "Start the database" runs only for `session=up` and was skipped; the plan had nothing to create, so "Apply the switches" changed nothing.
- **Database stop behaviour:** both the "Stop the database" job and the step inside "Testing down" reported `stopped`.
- **Timing:** GitHub starts scheduled runs late. The two runs above started at 00:21 and 08:06; as of 20:30 UTC on 14 Nov no later scheduled run had started. This is the known GitHub limitation of layer 1 (operator runbook §14), not a failure.

## AWS backstop (EventBridge Scheduler, 21:00 UTC) [V]

- 11 schedules `munaxa-nonprod-backstop-*` (the database and 10 services), all `ENABLED` (14 Nov 20:40).
- Last stop it made: 13 Nov 21:00:48, `StopDBInstance` by `munaxa-nonprod-session-backstop`; RDS "DB instance stopped" 21:07:07 (stage D report 03; RDS events re-read 14 Nov).
- The database has stayed stopped since then (no RDS event after 21:07 on 13 Nov), so there was nothing for the 14 Nov runs to stop. The 14 Nov 21:00 run was after this read.

## Budgets (14 Nov 20:40 UTC) [V]

| Budget | Limit | Actual (November) | Change since 13 Nov 21:20 |
| --- | --- | --- | --- |
| `munaxa-account-monthly` (alert only) | US$10 | **US$10.21, over the limit** | +US$0.54 |
| `munaxa-shared-account-monthly` | US$50 | US$10.21 | +US$0.54 |
| `munaxa-shared-testing-monthly` | US$50 | US$2.38 | +US$0.39 |
| `munaxa-docs-eu-prod-monthly` (retired Docs production) | US$10 | US$5.53 | — |

- The budgets send alerts only; on 13 Nov none had a budget action (stage R), and this read did not re-check actions.
- [E] The Testing increase is most likely the database running on 13 Nov (16:27–21:07) and storage, not new resources: no ALB, NAT, Elastic IP or task exists (02 F).
- No CloudWatch alarm is defined in either region.
