# 03. Scheduled Testing shutdown after the D-B3 apply

> **Status note, 18 Nov 2026 about 14:30 UTC.** This file was written before D-B2R (10:00–10:35 UTC) and is kept as that record.
> Since then:
> - PR #137 was squash-merged with the owner's approval as `a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd`, at 13:24 UTC.
> - The owner plan passed at 13:33 UTC (file 12).
> - The owner applied that reviewed plan at 13:35–13:37 UTC: 0 added, 1 changed, 0 destroyed; post-apply plan no changes; 70 resources (VERIFIED FROM OWNER LOG, file 13).
> - Claude re-read the live policy: version `v3` contains `states:ListStateMachineVersions` (VERIFIED LIVE — READ ONLY, file 13).
> - Still NOT VERIFIED: a scheduled `down` passing "Plan the switches" (file 14).
> - Live values were read later, read-only, at 12:43 UTC and 14:20 UTC (files 11 and 14): state machine ACTIVE, 0 executions, R ENABLED, `-failed` OK, `-not-run` ALARM since 09:19 UTC, no P/S schedule, ECS 0/0, no ALB, RDS stopped, topic 0 subscriptions.


## 1. Runs of `aws-session.yml` since the 15 Nov merges

From the GitHub Actions API, 18 Nov 2026 about 10:00 UTC. All are `schedule` events on `main`.

| Run | Created (UTC) | Head | Conclusion | "Plan the switches" | Database stop |
| --- | --- | --- | --- | --- | --- |
| 43774638948 | 15 Nov 23:24 | `9752146` | failure | failed (D-B3 not applied) | success |
| 43832834804 | 16 Nov 08:38 | `9752146` | failure | failed (same) | success |
| 44003429600 | 17 Nov 02:30 | `19fa5bc` | cancelled | not run (queued behind the nonprod plan waiting for approval) | success |
| 44058453773 | 17 Nov 09:45 | `19fa5bc` | cancelled | not run (same) | success |
| 44217528747 | 18 Nov 01:39 (down job ran 08:15) | `19fa5bc` | failure | failed: `states:ValidateStateMachineDefinition` (D-B3 not yet applied) | success |
| **[44274042137](https://github.com/munaxa/munaxa-platform/actions/runs/44274042137)** | **18 Nov 09:14** | `3453f13` | **failure** | **failed: `states:ListStateMachineVersions`** | **success**, both jobs |

Run 44274042137 is the first scheduled `down` after the D-B3/D-PIN apply, which finished at
08:34 UTC. No later scheduled run exists as of this report. The next cron slots are 19:17 UTC
and 01:47 UTC, and GitHub usually starts them late.

## 2. The 09:14 UTC run in detail (job logs read in this task)

**Job "Stop the database"** (id 134697520274), 09:14:25–09:14:36 UTC: **success**.

**Job "Testing down"** (id 134697521079), 09:14:26–09:15:07 UTC: **failure**.

- "Does the nonprod stack exist" and `terraform init` (AWS provider 6.67.0): success.
- **"Plan the switches", 09:14:48–09:15:03: failure.**

```
Error: listing Step Functions State Machine (arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup) Versions:
operation error SFN: ListStateMachineVersions, https response error StatusCode: 400, ...
api error AccessDeniedException: User: arn:aws:sts::229251310592:assumed-role/munaxa-shared-deployer-nonprod-session/gha-run-44274042137
is not authorized to perform: states:ListStateMachineVersions on resource:
arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup
because no identity-based policy allows the states:ListStateMachineVersions action
  with aws_sfn_state_machine.session_cleanup[0], on session-cleanup.tf line 168
```

- "Start the database" and "Apply the switches": skipped, so nothing was applied.
- "Stop the database" (in the job): success, with `database munaxa-nonprod-pg: stopped`.

## 3. Answers to the seven questions

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| 1 | Latest scheduled `down` result | Run 44274042137, **failure** | VERIFIED (GitHub) |
| 2 | Did switch planning succeed? | **No.** It failed at refresh on `states:ListStateMachineVersions`. The 16-18 Nov error (`ValidateStateMachineDefinition`) is gone, because the state machine now exists and the definition is unchanged | VERIFIED (log) |
| 3 | Did the database stop succeed? | **Yes**, in both the separate job and the down job: `database munaxa-nonprod-pg: stopped` | VERIFIED (log). The live RDS state today is NOT VERIFIED (§5) |
| 4 | Is the cleanup state machine active? | It exists: the provider's `DescribeStateMachine` read succeeded and the error came at the next call, `ListStateMachineVersions`. The apply created it at 08:34. Its `status` field (ACTIVE) was not read | **NOT VERIFIED** (connector) |
| 5 | Did any cleanup execution occur? | Nothing in the repository or the reports started one. Schedule R first fires 18 Nov 21:05 UTC, after this report | **NOT VERIFIED** live. None expected before 21:05 UTC |
| 6 | Was any ECS task or service started? | No `up` run exists, and the session plan failed before any apply. An `up` is the only path in the repository that creates services | VERIFIED from records. Live: **NOT VERIFIED** |
| 7 | Any remaining IAM or workflow failure? | **Yes (at 09:15 UTC; fixed by the D-B2R apply at 13:37 UTC, file 13).** The session role lacks `states:ListStateMachineVersions`. Every scheduled `down` will fail at "Plan the switches" until the fix is applied. A Testing `up` would fail the same way, so no session can start | VERIFIED (log + provider source) |

## 4. Root cause and minimum safe correction

- **Cause.** AWS provider `hashicorp/aws` v6.67.0, `internal/service/sfn/state_machine.go`. Its
  `resourceStateMachineRead` calls `DescribeStateMachine`, then **always**
  `ListStateMachineVersions` (to set `state_machine_version_arn`). Its definition validation
  (`ValidateStateMachineDefinition`) runs in `CustomizeDiff` **only if `definition` changes**. The
  source was read for this task from the provider's public repository at tag `v6.67.0`.
- **What D-B2 granted.** D-B2 gave the session role (`RefreshSessionCleanup`, managed policy
  `munaxa-shared-deployer-nonprod-session-read`) `states:DescribeStateMachine` and
  `states:ListTagsForResource`, but not `ListStateMachineVersions`. The full nonprod deployer has it
  (`OwnSessionCleanupStateMachine`). This is why the enforced plan and apply runs succeeded and only
  the session role fails.
- **Minimum correction.** Add the one read action `states:ListStateMachineVersions` to
  `RefreshSessionCleanup`, on the same nonprod-only resources. It needs no boundary change: the
  session role has no permissions boundary. It needs no write and no `ValidateStateMachineDefinition`
  for the session role.
- **The fix.** [PR #137](https://github.com/munaxa/munaxa-platform/pull/137), a separate code PR.
  Details in file 04.
- **Other refresh reads checked**, because a failing node makes Terraform skip its dependants:
  - schedule R needs `scheduler:GetSchedule`, and the two alarms need `cloudwatch:DescribeAlarms`;
    both are in the shared `deployer_read` policy (`iam_allow.tf`);
  - the alarms' tags need `cloudwatch:ListTagsForResource`, and the topic needs
    `sns:GetTopicAttributes` and `sns:ListTagsForResource`; all are in `RefreshSessionCleanup`;
  - the cleanup and backstop roles need `iam:GetRole*` and `iam:List*RolePolicies`, which
    `RefreshOwnRoles` grants on `role/munaxa-shared/munaxa-nonprod-*`.

  No other gap was found in the code. This is not proven live. The first scheduled `down` after the
  fix is applied is the check.

## 5. Live AWS read-only verification: BLOCKED

The planned read-only check could not run.

- **Planned reads:**
  - STS caller;
  - Step Functions `DescribeStateMachine`, `ListExecutions` and `ListStateMachineVersions`;
  - Scheduler `ListSchedules` and `GetSchedule` (R);
  - CloudWatch `DescribeAlarms`;
  - SNS `GetTopicAttributes` and `ListSubscriptionsByTopic`;
  - ECS `ListServices` and `ListTasks`;
  - RDS `DescribeDBInstances`;
  - ELBv2 `DescribeLoadBalancers`.

  No secret value was in the plan.
- **What happened:** all three attempts, between about 10:03 and 10:12 UTC, were refused with
  "needs you to sign in again". The connector registry showed `needs_reconnect`.
- **Result:** nothing was read from AWS in this task.
- **Owner action:** sign in to the AWS connector again on claude.ai (Settings, Connectors). The
  same read-only check can then run, and its results go in an addendum to this report.
