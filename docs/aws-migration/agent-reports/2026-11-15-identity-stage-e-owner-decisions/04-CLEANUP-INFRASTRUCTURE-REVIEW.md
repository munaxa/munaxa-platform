# 04. Cleanup infrastructure review (D-B2, D-B3)

**Status: code merged with PR #130 (`2f6d443`), switched off on `main`. Enabling configuration on
PR #132 (draft). Nothing planned against AWS, nothing applied.**

## 1. Expected change counts, verified offline

**D-B2, bootstrap (root, CloudShell, `-var testing_session_cleanup=true`): 2 updates, 2 creates.**

| Address | Action |
| --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` | update in place |
| `aws_iam_policy.deployer_session_read["nonprod"]` | update in place |
| `aws_iam_policy.deployer_session_cleanup[0]` | create |
| `aws_iam_role_policy_attachment.deployer_session_cleanup[0]` | create |

Evidence: bootstrap Terraform tests 14/14 (file 08), which assert these four addresses with the flag
on and none with it off. The real plan must be run by the owner in CloudShell (the bootstrap root
has no CI plan path) and shown to Claude before the apply is approved (file 06 §3).

**D-B3, stack nonprod (`session_cleanup_enabled = true`, PR #132): 8 creates, 1 update.**

| Address | Action |
| --- | --- |
| `aws_iam_role.session_cleanup[0]` | create |
| `aws_iam_role_policy.session_cleanup[0]` | create |
| `aws_sfn_state_machine.session_cleanup[0]` | create |
| `aws_scheduler_schedule.session_cleanup_daily[0]` | create |
| `aws_sns_topic.session_cleanup_alerts[0]` | create |
| `aws_sns_topic_policy.session_cleanup_alerts[0]` | create |
| `aws_cloudwatch_metric_alarm.session_cleanup_failed[0]` | create |
| `aws_cloudwatch_metric_alarm.session_cleanup_not_run[0]` | create |
| `aws_iam_role_policy.session_backstop[0]` | update (adds `states:StartExecution` on this one state machine) |

Evidence: an offline mocked plan with `-var-file=envs/nonprod.tfvars` on the PR #132 branch
(`6df2c4c`) counts exactly these 9, plus the 1 probe create of D-PIN (file 05). The same plan on
`main` defaults counts 0 of them and leaves the backstop policy unchanged. The declaration
`envs/nonprod.expected-changes.json` on #132 lists these 10 addresses; `check-plan-intent.sh
--validate` passes, a synthetic `--enforce` with exactly these changes passes, and one extra change
(an `identity_bootstrap` replacement) is refused.

## 2. Safety properties checked

| Property | Finding |
| --- | --- |
| Production impossible | `session_cleanup_enabled` has a validation `environment == "nonprod"`; the state machine has a `precondition` `environment == "nonprod"`; every resource name comes from the nonprod prefix; the cleanup role's own policy denies every `prod` name and every other secret; the nonprod workload boundary caps it. `envs/prod.tfvars` does not set the flag |
| Defaults off | `session_cleanup_enabled` default `false`; `identity_probe_source` default empty; bootstrap `testing_session_cleanup` default `false`. Merging #130 changed no plan (test `main_defaults_create_none_of_it`) |
| H-20 | `h20-session-cleanup-gate-and-arm.py` (merged): `gate` before every `up` (state machine ACTIVE, last SUCCEEDED real run within 26 h, nothing RUNNING, R enabled with `dryRun false`, both alarms present and not in ALARM, no leftover P or S schedule); `arm` P at H and S at H+30 min, both before the 21:00 UTC backstop; `disarm` after a verified `down`. 18 tests pass |
| Input cannot redirect the state machine | Every name and ARN (cluster, services, ALB name and ARN pattern, VPC, database, secret) is fixed at plan time by `templatefile`. The only input read is `dryRun`; any other input fails at once with `BadInput` and changes nothing. The ALB is deleted only if it is the internet-facing application load balancer in this stack's VPC |
| L-A0 interplay | The secret branch force-deletes only `munaxa-nonprod/identity-bootstrap` (the retired one-run copy), never `identity-operator`; the cleanup role is denied on every other secret. After PR #131 the bootstrap copy is never created, so that branch reports it absent. A window left open by a lost session expires on its own (file 03) |
| Alarms | `…-failed`: metric math sum of ExecutionsFailed, ExecutionsTimedOut, ExecutionsAborted, `treat_missing_data = notBreaching`. `…-not-run`: ExecutionsSucceeded, 26 of 26 hourly periods, missing data breaching, so it fires if R never succeeds in 26 h. Both notify the SNS topic, which is unencrypted (accepted: alarm names and states only) |
| Schedule and timezone | R `cron(5 21 * * ? *)`, `schedule_expression_timezone = "UTC"`, flexible window OFF, input `{"dryRun": false}`, run by the existing backstop scheduler role, 3 retries within 1 h. 21:05 UTC is five minutes after the 21:00 UTC backstop. In winter this is 22:05 in Central European Time |

## 3. Things the owner should know before approving D-B3

- **The apply starts a real daily action.** From the first 21:05 UTC after the apply, R runs with
  `dryRun false` every day. With nothing running it changes nothing (it finds no ALB, no running
  task, the database already stopped and no bootstrap secret) and should SUCCEED. That first real
  success is what H-20 `gate` needs before any `up`.
- **The not-run alarm may fire once** if the email subscription (D-B5) is confirmed but R has not yet
  succeeded 26 hours after the alarm is created. That is expected; it clears after R's first success.
- The apply also needs the session down, because the session workflow refuses a plan with
  non-session changes. Merging #132 without applying it would stop every scheduled `down` at its
  switch-plan step (the database stop step still runs). So #132 is merged only when its apply is
  approved for the same day.

## 4. Tooling run

`terraform fmt -check -recursive` clean, `terraform validate` clean, stack Terraform tests 75/75 on
the #132 branch, bootstrap tests 14/14 on `main` (file 08). Terraform 1.16.5, AWS provider 6.67.0,
offline, AWS credentials removed.

Stop point: no plan against AWS, no apply. Gates in file 09.
