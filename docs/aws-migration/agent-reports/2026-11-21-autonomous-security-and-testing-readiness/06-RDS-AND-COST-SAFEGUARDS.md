# 06. RDS rotation and Testing cost safeguards

No AWS call was made in this task. Nothing was started, stopped, rotated, applied or rescheduled.

## 1. Timing basis [INFERENCE from the latest reports]

- Stage E stopped `munaxa-nonprod-pg` at about 10:42 UTC on 21 Nov (`down` run 44895287466,
  cleanup verified 10:45 UTC). RDS restarts a stopped instance 7 days after the stop, so the next
  automatic restart is **about 28 Nov 10:45 UTC (13:45 Amman)**. The 28 Nov 00:57:33 UTC time in
  the rotation report is stale.
- The master secret's next rotation (`NextRotationDate` 27 Nov 23:59:59 UTC, from 21 Nov 04:23 UTC)
  will fail hourly while the database is stopped, then succeed shortly after the auto-start (on
  20 Nov it succeeded 15 minutes after).
- Without the new design (section 3) the auto-started database runs until the 21:00 UTC backstop,
  or an earlier late scheduled GitHub `down`: up to about 10 hours of db.t4g.micro (cents).

## 2. Read-only verification procedure (AWS connector, metadata only)

Rules for every step: read-only calls only; never `GetSecretValue`, `BatchGetSecretValue`,
`RotateSecret`, `StartDBInstance`, `StopDBInstance`, or any write; record values and ids, never a
secret value. Times UTC.

| When | # | Call | Expect | Records |
| --- | --- | --- | --- | --- |
| **22 Nov**, any time | 0 | `rds:DescribeDBInstances` `munaxa-nonprod-pg` | `stopped`; `AutomaticRestartTime` ≈ 28 Nov 10:42 to 10:45 | replaces the inferred time; if it differs, move every 28 Nov time below accordingly |
| **28 Nov after 22:00** (01:00 Amman 29 Nov) | 1 | `rds:DescribeDBInstances` | `stopped`; new `AutomaticRestartTime` ≈ 5 Dec | status, time |
| | 2 | `rds:DescribeEvents` (instance, last 48 h) | RDS-EVENT-0154 auto-start ≈ 10:45 28 Nov; "Reset master credentials"; a stop event | event ids and times |
| | 3 | `secretsmanager:DescribeSecret` on the RDS master secret (`rds!db-c3ef5041-…`) | `LastRotatedDate` after the auto-start; `NextRotationDate` ≈ 7 days later; `RotationEnabled` true | dates |
| | 4 | `secretsmanager:ListSecretVersionIds` (include deprecated) | exactly one `AWSCURRENT` (new id, not `5f35b6a0…`), one `AWSPREVIOUS` = `5f35b6a0…` | version ids and labels |
| | 5 | `cloudtrail:LookupEvents` (resource = the secret, 27 Nov 23:00 to 28 Nov 23:00) | `RotationFailed` hourly before the start, then `RotationSucceeded`; **0** `GetSecretValue` by a person; 0 manual `RotateSecret` | counts |
| | 6 | `cloudtrail:LookupEvents` `StopDBInstance` | one stop, actor: backstop role (21:00), cleanup R, GitHub `down`, or (once enabled) the restart-stop role | actor, time |
| | 7 | `ecs:ListTasks` / `ListServices` cluster `munaxa-nonprod` | 0 running tasks; services absent or desired 0 | counts |
| | 8 | `elbv2:DescribeLoadBalancers`, `ec2:DescribeNatGateways`, `DescribeAddresses`, `DescribeInstances`, `elasticache:DescribeCacheClusters` | none of the nonprod session resources | counts |
| | 9 | `scheduler:ListSchedules` prefix `munaxa-nonprod-` | backstop (11) and R enabled; **no** `…-session-cleanup-p-*`/`-s-*` (H-20 disarmed) | names, states |
| | 10 | `states:ListExecutions` on `munaxa-nonprod-session-cleanup` | R of 28 Nov `SUCCEEDED` | execution name, status |
| | 11 | `cloudwatch:DescribeAlarms` prefix `munaxa-nonprod-session-cleanup` | `-failed` and `-not-run` in `OK` | states |
| | 12 | `ce:GetCostAndUsage` (month to date, tag `Environment=nonprod`) and `budgets:DescribeBudgets` | Testing well under US$50; note the legacy US$10 account budget | amounts |

If step 1 shows the database **running** after 22:00 UTC: do not stop it from the connector
(not authorised); report to the owner, who can approve `scripts/aws/stop-database.sh` or a
`down` dispatch.

## 3. Event-driven delayed stop (option C): built in code, OFF [IMPLEMENTED, TESTED]

In platform#152: `infra/aws/stack/rds-restart-stop.tf`, `rds-restart-stop/definition.asl.json`,
`rds-restart-stop/test_rds_restart_stop.py`, `tests/rds-restart-stop.tftest.hcl`, variable
`rds_restart_stop_enabled` (default **false**). The 2 h wait is fixed in the definition.

**Flow.** EventBridge rule: `source aws.rds`, `detail-type "RDS DB Instance Event"`,
`resources = [nonprod instance ARN]`, `detail.EventID = ["RDS-EVENT-0154"]` → Step Functions
(standard, 6 h timeout):

1. Wait 2 h (the rotation retries hourly; on 20 Nov it succeeded 15 min after the start).
2. `DescribeDBInstances`: exactly one instance with the expected id and a string status, else fail.
   `stopped`/`stopping` → done. `available` → continue. Anything else → wait 15 min and re-read
   (bounded by the 6 h timeout).
3. `ecs:ListTasks` (cluster, RUNNING, max 1): any task → a session owns the database → end
   without stopping.
4. `scheduler:ListSchedules` for `munaxa-nonprod-session-cleanup-p-` and `-s-`: any → a session is
   armed → end without stopping.
5. `secretsmanager:DescribeSecret` (metadata only; recorded in the execution history; never gates
   the stop; its failure does not block it).
6. `rds:StopDBInstance`; `InvalidDBInstanceState` → done (state changed meanwhile).
7. Any read that fails or answers in an unexpected shape → execution `FAILED`
   (`RestartStop.GuardFailed`), **nothing stopped**; an alarm on `ExecutionsFailed` notifies the
   session-cleanup SNS topic; the 21:00 UTC backstop is untouched and still runs.

**IAM.** State machine role: `rds:DescribeDBInstances` and `rds:StopDBInstance` on the one
instance ARN; `ecs:ListTasks` with `ecs:cluster` condition; `scheduler:ListSchedules`;
`secretsmanager:DescribeSecret` on the master secret only; explicit denies on every secret-value
action and on start/modify/delete/reboot of any database. EventBridge role: `states:StartExecution`
on this state machine only. Both under the workload permissions boundary.

**Tests.**
- 11 offline simulator tests (`../session-cleanup/asl_simulator.py`, which gained `IsString`):
  idle auto-start stopped after ≥ 7,200 s; database still starting is waited for; never-settling
  database times out with no stop; a running task or an armed P or S schedule prevents the stop;
  stopped/stopping left alone; `InvalidDbInstanceState` on stop is success; throttling retried; a
  rotation-read failure does not block; ten fail-closed cases (unreadable tasks, schedules or
  database; missing `TaskArns` or `Schedules`; another or two databases; no instance; non-string
  status; stop denied), each with no stop.
- 4 mocked Terraform runs: off by default (no resource), refused without the session cleanup,
  refused in prod, and the enabled shape (event pattern, exactly five allowed actions,
  database scope, secret-value deny, 2 h wait, P/S prefixes, EventBridge target, alarm).
- Whole stack suite: **91 passed, 0 failed** (87 existing + 4 new); `fmt` and `validate` clean;
  Prettier clean on the definition (the platform lint job formats JSON).

**Unverified until a live dry run:** the SDK integration's exact field names for
`scheduler:listSchedules` (`Schedules`) and `secretsmanager:describeSecret`, and EventBridge
delivery of RDS-EVENT-0154. The RDS and ECS calls use the same names as the live, proven session
cleanup.

**Enabling (OWNER ACTION, two applies, not done):**
1. Bootstrap (root), nonprod only: workload boundary + `scheduler:ListSchedules`,
   `secretsmanager:DescribeSecret` (RDS master secret), `states:StartExecution` on
   `munaxa-nonprod-rds-restart-stop`; deployer + `events:PutRule`, `PutTargets`, `DeleteRule`,
   `RemoveTargets`, `DescribeRule`, `ListTargetsByRule`, `TagResource`, `ListTagsForResource` on
   rule `munaxa-nonprod-*`; session-read role + the `events` read calls (`DescribeRule`,
   `ListTargetsByRule`, `ListTagsForResource`) that a refresh makes. Claude prepares this as a PR
   when the owner says yes.
2. Stack: `rds_restart_stop_enabled = true` in `envs/nonprod.tfvars`, declaration of the 8 creates,
   plan and apply.

## 4. Cost and idle controls, unchanged [VERIFIED code]

Backstop `cron(0 21 * * ? *)` (database stop + 10 scale-ins), cleanup R `cron(5 21 * * ? *)` with
`-failed` and `-not-run` alarms, H-20 gate before every `up`, scheduled GitHub `down` twice a day,
every service at desired 0 in `envs/nonprod.tfvars`. Nothing in this task changed any of them; the
new resources are absent unless enabled.
