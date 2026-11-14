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

## AWS backstop (EventBridge, 21:00 UTC)

- Last direct evidence: 13 Nov, `StopDBInstance` at 21:00:48 by `munaxa-nonprod-session-backstop`, database stopped at 21:07 (stage D report 03).
- 14 Nov: **NOT VERIFIED** (no AWS read, 02).

## Budgets and alarms

**NOT VERIFIED on 14 Nov** (no AWS read, 02). Last direct readings, 13 Nov 21:20 UTC:

| Budget | Reading |
| --- | --- |
| `munaxa-account-monthly` US$10, alert only | US$9.67, 80 % alert in ALARM |
| Testing US$50 | US$1.99 |
| Account US$50 | US$9.67 |

No running resource has been added since: stage D registered task definitions and created an empty secret container (about US$0.40 a month once it has a version; Secrets Manager bills per secret). [E]
