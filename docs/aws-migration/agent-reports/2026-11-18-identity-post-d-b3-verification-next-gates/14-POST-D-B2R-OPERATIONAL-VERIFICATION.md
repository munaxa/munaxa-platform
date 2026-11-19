# 14. After D-B2R: scheduled `down` and the first real cleanup run (schedule R)

**Status at 21:30 UTC, 18 Nov 2026:**

- **First real cleanup run (R): VERIFIED LIVE — READ ONLY.** SUCCEEDED, with real input and no write scheduled.
- **Scheduled `down` after the fix: WAITING FOR SCHEDULE.** GitHub has not started the 19:17 UTC slot yet.

(At 14:30 UTC both were WAITING FOR SCHEDULE.)

## 1. Scheduled Testing `down` (`aws-session.yml`)

The cron slots are `17 19 * * *` and `47 1 * * *` UTC. GitHub often starts scheduled runs late: the
two most recent runs started at 01:39 UTC (run 44217528747) and at 09:14 UTC (run 44274042137).

**Runs since the D-B2R apply at 13:37 UTC:** none at 14:30 UTC, and still none at 21:28 UTC
(VERIFIED FROM GITHUB RECORDS). The latest run is still 44274042137, which failed before the fix
(file 03). The 19:17 UTC slot has not started yet. On 17–18 Nov a slot started about 6–7.5 h late
(01:47 → 09:14). No replacement run was dispatched.

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
| 1 | An R execution exists for 18 Nov 21:05 UTC | Yes: the only execution of the state machine, started 21:05:22.079 UTC and stopped 21:05:23.202 UTC (execution name is the scheduler's UUID `1a6afe12-…`) | VERIFIED LIVE — READ ONLY |
| 2 | Status SUCCEEDED, real input | `SUCCEEDED`. Input `{"dryRun":false}`. Output `dryRun: false`. Results: secret `absent`; alb `absent`; ecs `done` with `tasksFound: 0` and all 10 services `absent`; database `stopped`. Every branch `ok: true` | VERIFIED LIVE — READ ONLY |
| 3 | No unexpected write scheduled | `GetExecutionHistory` (194 events, no failure or timeout event). The only `TaskScheduled` resources are `listSecrets`, `describeLoadBalancers`, `describeServices`, `listTasks` and `describeDBInstances`, all reads. No delete, scale, stop or `StopTask` was scheduled | VERIFIED LIVE — READ ONLY |
| 4 | `-not-run` back to OK, `-failed` still OK | `-failed` is OK (since 08:35 UTC). `-not-run` is **still ALARM** (since 09:19 UTC) at 21:28 UTC. The alarm evaluates hourly periods, so the 21:05 success may not have been evaluated yet | NOT VERIFIED (recheck after the next hourly evaluation) |
| 5 | Idle state unchanged | ECS 0 services, 0 tasks; load balancer `LoadBalancerNotFound`; RDS `stopped`; R `ENABLED` with `{"dryRun":false}`; 11 backstop schedules `ENABLED`; no P/S session schedule; topic 0 confirmed, 0 pending | VERIFIED LIVE — READ ONLY |

**What this run proves.**

- The state machine runs end to end in AWS with the cleanup role and real input.
- Its read permissions work.
- With nothing left over, it scheduled no write.

**What it does not prove.** The delete, scale and stop permissions: they ran on nothing.

No AWS resource is started, stopped, modified or executed by Claude for this check.

## 3. H-20 re-evaluated with the live values (18 Nov, about 21:30 UTC)

All of these values were read read-only, at 21:28–21:31 UTC. Claude did not run the H-20 `gate` script itself, and did not run `arm`.

| # | Condition (as coded in `gate`) | Live value | Status |
| --- | --- | --- | --- |
| 1 | State machine exists, `ACTIVE`, `STANDARD` | `ACTIVE`, `STANDARD` | VERIFIED LIVE — READ ONLY |
| 2 | Latest SUCCEEDED execution ended within 26 h | 21:05:23 UTC today | VERIFIED LIVE — READ ONLY |
| 3 | That success was a real run | input `{"dryRun":false}` | VERIFIED LIVE — READ ONLY |
| 4 | No execution RUNNING | the only execution has SUCCEEDED | VERIFIED LIVE — READ ONLY |
| 5 | R ENABLED, targets the state machine with the backstop role and real input | `ENABLED`; target `stateMachine:munaxa-nonprod-session-cleanup`; role `munaxa-shared/munaxa-nonprod-session-backstop`; input `{"dryRun":false}` | VERIFIED LIVE — READ ONLY |
| 6 | Both alarms exist | both present | VERIFIED LIVE — READ ONLY |
| 7 | Neither alarm in ALARM | `-not-run` **ALARM** | **NOT SATISFIED** |
| 8 | No leftover P/S schedule | none (12 schedules: 11 backstop and R) | VERIFIED LIVE — READ ONLY |
| — | Enforced before every `up` | no gate step in `aws-session.yml` | **NOT ENFORCED BY CODE** (design in file 16) |

**H-20: BLOCKED**, on condition 7 only.

- **Why the alarm has not cleared.** `-not-run` is `Sum(ExecutionsSucceeded) < 1` over 26 one-hour periods, all 26 must breach, and missing data counts as breaching. Its only state change so far was INSUFFICIENT_DATA → ALARM at 09:19 UTC.
- **When it should clear.** The success at 21:05 UTC falls in the 21:00–22:00 UTC period. Once CloudWatch evaluates that period, one period no longer breaches and the alarm should return to OK. This is expected shortly after 22:00 UTC, but it is **not verified** until read.
- **Even when every condition passes**, H-20 is only one Stage E precondition. It is procedural, and Stage E is NOT AUTHORIZED.
