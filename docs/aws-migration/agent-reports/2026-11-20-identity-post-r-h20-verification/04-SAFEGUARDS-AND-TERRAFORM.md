# 04 Safeguards and Terraform consistency

The checks ran at 19 Nov 2026 21:21 to 21:22 UTC (00:21 to 00:22 Amman); "read again" means checked at that time, not copied from an earlier report.

## Cleanup schedule and target

| Item | Code (`main` 0f06836) | Live | Result |
| --- | --- | --- | --- |
| Name | `munaxa-nonprod-session-cleanup-daily` | same, group `default` | PASS |
| State | enabled | ENABLED | PASS |
| Expression | `var.session_cleanup_schedule` default `cron(5 21 * * ? *)` (variables.tf, not overridden in `envs/nonprod.tfvars`) | `cron(5 21 * * ? *)` | PASS |
| Timezone | UTC | UTC (21:05 UTC = 00:05 Amman) | PASS |
| Flexible window | OFF | OFF | PASS |
| End date | none | none | PASS |
| Target | state machine `munaxa-nonprod-session-cleanup` | same | PASS |
| Role | `munaxa-shared/munaxa-nonprod-session-backstop` | same | PASS |
| Input | `{"dryRun":false}` | same | PASS |
| Retry | max 3 attempts | 3 attempts, max event age 3600 s | PASS |
| Last modified | | 18 Nov 08:34:04 UTC (D-B3 apply), not since | PASS |

The state machine `munaxa-nonprod-session-cleanup` is ACTIVE and STANDARD, and runs as role `munaxa-shared/munaxa-nonprod-session-cleanup`. None of its executions is running.

The backstop role's trust policy allows only `scheduler.amazonaws.com`, with condition `aws:SourceAccount = 229251310592`. That is the expected and minimal trust.

## Backstop schedules (read again)

There are 12 schedules, all ENABLED:

- the daily cleanup schedule;
- 11 backstop schedules: `munaxa-nonprod-backstop-` followed by database, identity, control-api, control-portal, work-api, work-admin, school-api, school-admin, docs-api, docs-web and docs-scanner.

There is no `munaxa-nonprod-session-cleanup-p-*` or `-s-*` (P/S) schedule, so there is no stale session schedule. The backstops fired at 21:00 UTC (see 01).

## Alarms and SNS (read again)

| Alarm | State | Since (UTC) | Actions |
| --- | --- | --- | --- |
| `munaxa-nonprod-session-cleanup-failed` | OK | 18 Nov 08:35:08 | enabled, SNS `munaxa-nonprod-session-cleanup-alerts` |
| `munaxa-nonprod-session-cleanup-not-run` | OK | 18 Nov 22:06:11 | enabled, same topic |

The SNS topic `munaxa-nonprod-session-cleanup-alerts` has one subscription, by email, and it is confirmed; none is pending. The address is the alert mailbox recorded in D-B5 and is not repeated here.

The `-not-run` alarm evaluates hourly over 26 periods. With R at 21:05 UTC it stays OK. The next state change would come only if no successful run happens before about 23:05 UTC 20 Nov.

## H-20 gate conditions (read-only evaluation, 21:22 UTC)

The gate was evaluated from the observations above. The connector gate script was not run, because its companion arm step writes a schedule.

| # | Condition (`scripts/aws/session-cleanup-gate.sh`) | Evidence | Result |
| --- | --- | --- | --- |
| 1 | state_machine_active | ACTIVE | PASS |
| 2 | succeeded_within_26h | newest SUCCEEDED stop 21:05:23 UTC, 16 min old | PASS |
| 3 | last_success_was_real | newest SUCCEEDED is 1a6aff64, input `{"dryRun":false}`, started by Scheduler | PASS (FAIL since the 03:45 dry run, now cleared) |
| 4 | none_running | 0 RUNNING | PASS |
| 5 | daily_enabled | ENABLED | PASS |
| 6 | daily_role_and_input | backstop role, `{"dryRun":false}` | PASS |
| 7 | alarms_present | both present | PASS |
| 8 | alarms_not_in_alarm | both OK | PASS |
| 9 | no_stale_session_schedules | no P/S schedules | PASS |
| 10 | own_session_armed | only meaningful during a session `up` | NOT APPLICABLE |

The gate's IAM reads (`states:ListExecutions` and `states:DescribeExecution`) are now in the session-read policy (see 03), so the workflow role can perform conditions 1 to 4 itself. The gate was not run from GitHub: no `up` was dispatched, because that is not authorized.

## Terraform consistency

**A Terraform plan was not run, deliberately.** Two reasons:

1. `terraform plan` against the S3 backend with `use_lockfile` writes and deletes a `.tflock` object in the state bucket. That is an AWS write, so the plan cannot be guaranteed read-only.
2. This container has no AWS credentials for Terraform. The connector is not usable as a Terraform credential source.

Consistency was instead established from the evidence below:

| Root | Evidence | Result |
| --- | --- | --- |
| bootstrap | The owner's apply at 11:28 UTC was followed by a post-apply plan: "No changes" (PR #141 file 06). Live policies equal the rendered code (03). CloudTrail shows no IAM write since 11:28:43. | consistent |
| stack-nonprod | Scheduled `aws-session.yml` `down` run 44497199076 (09:31 UTC 19 Nov, at `0f06836`) succeeded: "Plan the switches" and "Apply the switches" succeeded. The H-20 gate step was skipped, as designed for `down`. The earlier scheduled run 44435648783 (01:16 UTC) also succeeded. No non-read stack call appears in CloudTrail outside the backstops, R and the owner-approved D-B4/D-B5 actions. The live schedule, alarms and state machine match the code. | consistent |
| prod | No prod-path policy, role or resource change in CloudTrail; prod policies keep their November versions. | unchanged |

`main` is still `0f06836` (#138) at 21:22 UTC. No new commit has appeared since the 11:29 UTC check.

**Limitation:** this is indirect evidence. A fresh plan would need the owner's CloudShell or the next scheduled `down` run; the workflow's crons are `17 19 * * *` and `47 1 * * *` UTC, and GitHub starts them late, by hours.
