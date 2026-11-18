# 14. After D-B2R: scheduled `down` and the first real cleanup run (schedule R)

**Status at 14:30 UTC, 18 Nov 2026: WAITING FOR SCHEDULE.** Neither event has happened yet. This
file is updated when they have.

## 1. Scheduled Testing `down` (`aws-session.yml`)

The cron slots are `17 19 * * *` and `47 1 * * *` UTC. GitHub often starts scheduled runs late: the
two most recent runs started at 01:39 UTC (run 44217528747) and at 09:14 UTC (run 44274042137).

**Runs since the D-B2R apply at 13:37 UTC:** none at 14:30 UTC (VERIFIED FROM GITHUB RECORDS). The
latest run is still 44274042137, which failed before the fix (file 03).

Required evidence for the first run after the apply:

| # | Check | Status |
| --- | --- | --- |
| 1 | A scheduled `down` run exists after 13:37 UTC | WAITING FOR SCHEDULE |
| 2 | Its session job step "Plan the switches" succeeds | WAITING FOR SCHEDULE |
| 3 | Its `database` job (and the session job's "Stop the database") succeeds | WAITING FOR SCHEDULE |
| 4 | No `up`: the event is `schedule`, so `SESSION` is `down` | WAITING FOR SCHEDULE |
| 5 | No ECS service or task started (live read after the run) | WAITING FOR SCHEDULE |
| 6 | The plan changes nothing unexpected (plan summary in the job log) | WAITING FOR SCHEDULE |

No replacement workflow will be dispatched to get a result early.

## 2. First real cleanup execution (schedule R, `cron(5 21 * * ? *)` UTC, `{"dryRun":false}`)

**Live at 14:20 UTC** (VERIFIED LIVE — READ ONLY):

- state machine `ACTIVE`, with 0 executions;
- R `ENABLED`;
- alarm `-failed` OK, alarm `-not-run` ALARM;
- 11 backstop schedules `ENABLED`;
- no P/S session schedule;
- ECS 0 services and 0 tasks;
- RDS `stopped`.

Planned read-only checks after 21:05 UTC:

- the execution ARN, its start, stop and status;
- its input, which must be `{"dryRun":false}`;
- its output: the per-branch status and `ok`;
- its history: every `TaskScheduled` resource. With nothing to clean up, it should contain **no** delete, scale, stop or `StopTask` operation;
- ECS, the load balancer and RDS;
- both alarms, R and the backstop schedules.

| # | Check | Status |
| --- | --- | --- |
| 1 | An R execution exists for 18 Nov 21:05 UTC | WAITING FOR SCHEDULE |
| 2 | Status SUCCEEDED, real input | WAITING FOR SCHEDULE |
| 3 | No unexpected write scheduled | WAITING FOR SCHEDULE |
| 4 | `-not-run` back to OK, and `-failed` still OK | WAITING FOR SCHEDULE |
| 5 | Idle state unchanged | WAITING FOR SCHEDULE |

No AWS resource is started, stopped, modified or executed by Claude for this check.
