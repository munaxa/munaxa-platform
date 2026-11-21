# 04. Schedules and safeguards

Observed 21 Nov 2026 04:23 to 04:24 UTC (07:23 to 07:24 Amman).
APIs: `scheduler:ListSchedules`, `scheduler:GetSchedule`, `states:ListExecutions`,
`states:DescribeExecution`, `states:GetExecutionHistory`, `cloudwatch:DescribeAlarms`,
`sns:ListSubscriptionsByTopic`, `iam:GetRole`.

## EventBridge Scheduler

- **12 schedules, all ENABLED** **[V]**: the daily cleanup schedule and 11 backstops (10 ECS
  service scale-to-zero, 1 database stop).
- Daily cleanup: `cron(5 21 * * ? *)` UTC (00:05 Amman), flexible window OFF, target the session
  cleanup state machine, input `{"dryRun":false}`, backstop role, last modified 18 Nov 08:34:04
  UTC (D-B3 apply). **Unchanged** **[V]**.
- `backstop-database`: `cron(0 21 * * ? *)` UTC, target `rds:stopDBInstance`, last modified 6 Nov.
- Backstop role trust: `scheduler.amazonaws.com` only, with an `aws:SourceAccount` condition **[V]**.

## Cleanup R on 20 Nov

| Field | Value |
| --- | --- |
| Execution | `1a6b00b5-fcc7-48a0-bad9-043f5c61bd30` |
| Status | **SUCCEEDED** |
| Start / stop | 20 Nov 21:05:22.077 / 21:05:23.399 UTC (00:05 Amman 21 Nov) |
| Input | `{"dryRun":false}` |
| History | 194 events, no failure events |
| Task calls | listSecrets 1, describeLoadBalancers 1, describeServices 10, describeDBInstances 1, listTasks 1 |
| Output | all resources absent, database stopped; nothing to clean |

Executions of the state machine in total: 4 (18 Nov first real run, 19 Nov dry run
`dry-run-idle-20261119T0345`, 19 Nov `1a6aff64`, 20 Nov `1a6b00b5`). No manual execution **[V]**.

The success is taken from the execution record and its history, not from the schedule alone.

## 21:00 UTC backstops on 20 Nov

10 `UpdateService` calls returned `ServiceNotFound` (no services exist) and the database stop
returned `InvalidDBInstanceState` (already stopped at 21:00, the automatic start came at 21:11).
Both outcomes are expected for an idle environment **[V]**.

## Alarms and notifications

| Item | State |
| --- | --- |
| Cleanup failed alarm | OK since 18 Nov 08:35:08 UTC |
| Cleanup not-run alarm | OK since 18 Nov 22:06:11 UTC |
| SNS topic subscriptions | 1 email subscription, confirmed |

## Gap observed

The database backstop at 21:00 UTC cannot catch an RDS automatic start that happens after it.
On 20 Nov the database was stopped again only by the late GitHub scheduled `down` (00:51 UTC).
Cost of the gap: about 3 h 43 min of db.t4g.micro. See file 06.
