# Enabling the Testing RDS restart stop

This file prepares the enablement of the RDS restart stop. It does not enable it. The restart stop
is in `infra/aws/stack/rds-restart-stop.tf` (platform#152). Its design is in report
2026-11-21-autonomous-security-and-testing-readiness, file 06, section 3. Merging the branch
`rds-enable-pkg` changes no plan: the bootstrap flag `testing_rds_restart_stop` and the stack
variable `rds_restart_stop_enabled` both default to false. To enable the restart stop, the owner
says yes and then runs two applies, in this order.

## 1. Bootstrap (root, CloudShell)

The bootstrap code is in `infra/aws/bootstrap/iam_rds_restart_stop.tf` and adds to `iam.tf` and
`iam_session.tf`. Root runs a plan and an apply with `-var testing_session_cleanup=true -var
testing_rds_restart_stop=true`, the same way as the earlier D-B2 and H-20 bootstrap updates.

The plan summary should read **`Plan: 2 to add, 2 to change, 0 to destroy.`** and list only these
changes:

| Address | Action | What changes |
| --- | --- | --- |
| `aws_iam_policy.deployer_rds_restart_stop[0]` | create | `munaxa-shared-deployer-nonprod-rds-restart-stop`: `events:PutRule, DeleteRule, DescribeRule, PutTargets, RemoveTargets, ListTargetsByRule, TagResource, UntagResource, ListTagsForResource` on `rule/munaxa-nonprod-rds-restart-stop` only. `iam:PassRole` on role `munaxa-nonprod-rds-restart-stop` to `states.amazonaws.com` only, and on role `munaxa-nonprod-rds-restart-stop-events` to `events.amazonaws.com` only |
| `aws_iam_role_policy_attachment.deployer_rds_restart_stop[0]` | create | Attaches that policy to `munaxa-shared-deployer-nonprod` |
| `aws_iam_policy.workload_boundary["nonprod"]` | update | Adds four statements. `TestingRdsRestartStop`: `states:StartExecution` on `stateMachine:munaxa-nonprod-rds-restart-stop`. `TestingRdsRestartStopLookups`: `scheduler:ListSchedules` on `*`, which has no resource-level permission. `TestingRdsRestartStopRotationMetadata` and `...ByTag`: `secretsmanager:DescribeSecret` on `secret:rds!*`, only where the tag `aws:rds:primaryDBInstanceArn` is `db:munaxa-nonprod-pg`, or the tags are `Project = munaxa` and `Environment = nonprod`. Nothing else changes, and the prod boundary does not change |
| `aws_iam_policy.deployer_session_read["nonprod"]` | update | Adds `RefreshRdsRestartStop`: `events:DescribeRule, ListTargetsByRule, ListTagsForResource` on that one rule, so session plans can still refresh after the stack apply |

These counts hold only if the bootstrap state matches `main` and nothing else is pending. If the
plan shows anything else, stop.

The existing grants already cover the rest, and the bootstrap does not change them. The nonprod
deployer's `OwnRolesWithOwnBoundary` and `ManageOwnRoles` cover the two roles and their inline
policies. `OwnSessionCleanupStateMachine` and `ValidateDefinitions` cover the state machine,
because they apply to `stateMachine:munaxa-nonprod-*`. `OwnNames` covers the alarm through
`cloudwatch:*` on `alarm:munaxa-nonprod-*`, and `OwnAlarmTopics` covers the topic policy update.

The existing boundary statements also already cover these actions of the state machine role:
- `rds:DescribeDBInstances`, through `TestingSessionCleanup`
- `rds:StopDBInstance`, through `TestingBackstop`
- `ecs:ListTasks`, through `TestingSessionCleanupLookups`

The session deployer's existing reads cover the roles (`RefreshOwnRoles`), the state machine and
alarm tags (`RefreshSessionCleanup`), and `cloudwatch:DescribeAlarms` (`deployer_read`).

**Follow-up PR after this apply:** change the default of `testing_rds_restart_stop` to `true`, as
R-8 did for `testing_session_cleanup`. Until then, a root plan that leaves out the `-var` removes
these permissions: it shows 2 destroys and 2 updates.

## 2. Stack (aws-terraform.yml, aws-nonprod)

This is a PR with two changes.

1. Add to `infra/aws/stack/envs/nonprod.tfvars`:

   ```hcl
   # Testing RDS restart stop (rds-restart-stop.tf): 8 creates and the alerts topic policy update. Needs the bootstrap apply with testing_rds_restart_stop = true first.
   rds_restart_stop_enabled = true
   ```

2. Replace `infra/aws/stack/envs/nonprod.expected-changes.json` with
   `rds-restart-stop-enable.expected-changes.json` from this folder. It passes
   `check-plan-intent.sh --validate`.

The plan should show **8 creates and 1 update**, and nothing else:

| Creates (8) |
| --- |
| `aws_iam_role.rds_restart_stop[0]` |
| `aws_iam_role_policy.rds_restart_stop[0]` |
| `aws_sfn_state_machine.rds_restart_stop[0]` |
| `aws_iam_role.rds_restart_stop_events[0]` |
| `aws_iam_role_policy.rds_restart_stop_events[0]` |
| `aws_cloudwatch_event_rule.rds_restart_stop[0]` |
| `aws_cloudwatch_event_target.rds_restart_stop[0]` |
| `aws_cloudwatch_metric_alarm.rds_restart_stop_failed[0]` |

The update is `aws_sns_topic_policy.session_cleanup_alerts[0]`. Without it, the restart stop's alarm
could not notify. The topic policy admitted only alarms named `munaxa-nonprod-session-cleanup-*`.
The new alarm is `munaxa-nonprod-rds-restart-stop-failed`, so CloudWatch would have been refused
`sns:Publish`. The update adds the statement `RdsRestartStopAlarm` (`session-cleanup.tf`), which
admits that one alarm by its exact name, and only while the restart stop is enabled.

If `main` has any other unapplied nonprod stack change, the intent check refuses the plan. That
fails closed.

## Verification (read-only, after both applies)

- `aws events describe-rule --name munaxa-nonprod-rds-restart-stop`: `State ENABLED`, and the event
  pattern has `aws.rds`, `RDS DB Instance Event`, the instance ARN and `RDS-EVENT-0154`.
  `aws events list-targets-by-rule` shows one target: the state machine ARN, with the `-events`
  role.
- `aws stepfunctions describe-state-machine`: `STANDARD`, `ACTIVE`, and the role
  `munaxa-nonprod-rds-restart-stop`.
- `aws cloudwatch describe-alarms --alarm-names munaxa-nonprod-rds-restart-stop-failed`: the state
  is `OK` or `INSUFFICIENT_DATA`, and the action is the alerts topic. `aws sns
  get-topic-attributes` on the topic: the policy contains `RdsRestartStopAlarm`.
- `aws iam simulate-principal-policy` on each role, with the boundary as the permissions boundary,
  covering the five state machine actions and `states:StartExecution`. The DescribeSecret check
  needs the context key `aws:ResourceTag/aws:rds:primaryDBInstanceArn`.
- The next session plan, such as the scheduled `down`, refreshes without AccessDenied.

Do not use a manual `start-execution` as verification. Once the 2-hour wait ends, the execution
would stop the database if it were available with no task and no P or S schedule.

## Rollback

1. Stack: set `rds_restart_stop_enabled = false` (or remove the line) and declare the plan: **8
   destroys and 1 update** (the topic policy goes back to its two statements). Apply.
2. Then the bootstrap, as root: plan with `testing_rds_restart_stop=false` (or leave out the
   `-var`): 2 destroys and 2 updates. Apply. The bootstrap goes second because the deployer needs
   these permissions to destroy the stack resources.

The 21:00 UTC backstop and the session cleanup run before, during and after the rollback, and the
rollback does not change them.

## Cost

| Service | Use | Cost |
| --- | --- | --- |
| EventBridge | RDS events on the default bus | Free |
| Step Functions Standard | At most about 5 executions a month (the RDS auto-start comes after 7 days stopped) × about 10–40 state transitions, at US$0.025 per 1,000 transitions | Inside the 4,000-transition free tier, otherwise under 1 cent |
| CloudWatch | One standard alarm | US$0.10 a month if the account is past its 10 free alarms |
| SNS | Rare notifications | Free tier |

Total: a few cents a month at most, and US$0.10 a month at most including the alarm.

## Not verified until a live run

- The field names of the Step Functions SDK integration: `Schedules` from
  `scheduler:listSchedules`, and the `describeSecret` output. The offline simulator tests assume
  them.
- Whether EventBridge delivers RDS-EVENT-0154 as `RDS DB Instance Event` with the instance ARN in
  `resources`.
- Whether the master secret carries the tag `aws:rds:primaryDBInstanceArn`. This is residual R16(b).
  The `...ByTag` statement is the fallback. If both fail, DescribeSecret is denied, the step
  records the failure, and the stop still happens: it is not a gate.
- Whether `events:TagResource` is the only extra action for `PutRule` with tags, and whether
  provider 6.67 calls no other events action for the rule and target. It uses `state` through
  `PutRule`, with no separate `EnableRule` call. This was reasoned from the provider's behaviour,
  not tested against AWS.
- The bootstrap counts (2 creates, 2 updates) and the stack counts (8 creates, 1 update) assume that
  the live state matches `main` and has no drift. Both plans must be read before they are applied.
