# Terraform and IAM review (separate security boundary)

Date: 14 Nov 2026. Independent owner review of PR #130 (file 10). Offline only: `terraform fmt`,
`terraform validate` and `terraform test` with `init -backend=false`, mocked providers, AWS
credentials removed from the environment. No plan against a backend, no apply.

## Conclusion

Every Terraform change in PR #130 is **off by default**: at the defaults (`testing_session_cleanup =
false`, `session_cleanup_enabled = false`, `identity_probe_source` empty) no resource is created,
changed or replaced, in nonprod, prod or bootstrap (Terraform runs
`merging_the_cleanup_changes_no_nonprod_plan`, `the_backstop_policy_is_unchanged_while_the_cleanup_is_off`,
`be2_session_cleanup_is_off_by_default`). Nothing can be created in prod (`the_cleanup_never_exists_in_prod`,
variable validation, a `precondition` on the state machine, and the bootstrap statements filtered by
`each.key == "nonprod"`). The expected action counts in file 02 §7 and file 03 §4 are reproduced
below from the code. No Critical, High or Medium IAM finding; five Low findings are accepted with
their residual risk (§4).

## 1. Resource inventory (account 229251310592, eu-central-1)

### Bootstrap (`infra/aws/bootstrap`, root apply), gated by `testing_session_cleanup` (default `false`)

| Resource | Purpose | Action when enabled | Boundary change | Recurring cost | Can affect prod |
| --- | --- | --- | --- | --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` (`iam.tf`) | nonprod workload permission boundary: adds `TestingSessionCleanup` (DeleteSecret on `munaxa-nonprod/identity-bootstrap-??????` only, DeleteLoadBalancer on `loadbalancer/app/munaxa-nonprod/*`, ecs DescribeServices/StopTask in `munaxa-nonprod`, rds DescribeDBInstances on `munaxa-nonprod-*`, states:StartExecution on the one state machine) and `TestingSessionCleanupLookups` (DescribeLoadBalancers, ListTasks, ListSecrets on `*`) | **update** | **yes** (nonprod only) | no | no: `each.key == "nonprod"`; the prod boundary document is unchanged (Terraform run `be2_session_cleanup_widens_only_nonprod`) |
| `aws_iam_policy.deployer_session_read["nonprod"]` (`iam_session.tf`) | session deployer: reads of the state machine, topic and alarms so the scheduled `down` can refresh them | **update** | no | no | no |
| `aws_iam_policy.deployer_session_cleanup[0]` (`iam_session_cleanup.tf`) | nonprod deployer: create/update/delete `stateMachine:munaxa-nonprod-*` and `sns:munaxa-nonprod-*`, `ValidateStateMachineDefinition`, `iam:PassRole` of the cleanup role to `states.amazonaws.com` only | **create** | no | no | no (nonprod names; prod deployer not attached) |
| `aws_iam_role_policy_attachment.deployer_session_cleanup[0]` | attaches the above to `deployer["nonprod"]` | **create** | no | no | no |

**Bootstrap total when enabled: 2 updates, 2 creates, 0 destroys.** Matches file 02 §7.

### Stack (`infra/aws/stack`, nonprod), gated by `session_cleanup_enabled` (default `false`; requires nonprod and the backstop)

| Resource | Purpose | Action when enabled | Recurring cost |
| --- | --- | --- | --- |
| `aws_iam_role.session_cleanup[0]` | assumed only by `states.amazonaws.com` with `aws:SourceAccount` = 229251310592 and `aws:SourceArn` = the one state machine ARN; nonprod workload boundary | create | no |
| `aws_iam_role_policy.session_cleanup[0]` | delete the exact bootstrap secret, the tagged `munaxa-nonprod` ALB; scale services, stop tasks in the cluster, stop `munaxa-nonprod-pg`; explicit denies on every other secret delete, every secret value action and every `munaxa-prod*` resource | create | no |
| `aws_sfn_state_machine.session_cleanup[0]` | Standard state machine, 900 s timeout, `precondition` nonprod | create | per state transition only (a few hundred per run, inside the free tier at one run a day; not verified against the bill) |
| `aws_scheduler_schedule.session_cleanup_daily[0]` | R, `cron(5 21 * * ? *)` UTC, `dryRun false`, backstop role | create | one invocation a day |
| `aws_sns_topic.session_cleanup_alerts[0]` | alarm notifications (names and states only) | create | none without subscribers |
| `aws_sns_topic_policy.session_cleanup_alerts[0]` | CloudWatch of this account and these alarms only; TLS-only deny | create | no |
| `aws_cloudwatch_metric_alarm.session_cleanup_failed[0]` | any FAILED, TIMED_OUT or ABORTED execution | create | standard alarm (about US$0.10 a month per alarm, from public pricing; not verified) |
| `aws_cloudwatch_metric_alarm.session_cleanup_not_run[0]` | no SUCCEEDED execution in 26 hours (hourly periods, 26 of 26, missing data breaching; owner review A-7) | create | as above |
| `aws_iam_role_policy.session_backstop[0]` (`backstop.tf`) | adds `states:StartExecution` on the one state machine to the existing backstop scheduler role | **update** | no |

**Stack total when enabled: 8 creates, 1 update, 0 destroys.** Matches file 02 §7. The owner review
adds no resource: the not-run alarm's arguments changed (still one create), and the module output
`task_definition_size` (owner review B-8 test support) is an output only.

### Probe pin (separate PR, D-PIN)

`aws_ecs_task_definition.identity_probe[0]` (`identity-probe.tf`): **1 create** when
`identity_probe_source` is set. No role, policy or security group (it uses the bootstrap execution
role and the existing groups). Task definitions are `skip_destroy`, so later changes register new
revisions; E-1 runs only the latest ACTIVE revision that matches the manifest. Matches file 03 §4.

### Variables added

| Variable | Default | Effect of the default |
| --- | --- | --- |
| `testing_session_cleanup` (bootstrap) | `false` | no IAM change |
| `session_cleanup_enabled` (stack) | `false` | no resource; validation refuses `true` outside nonprod or without the backstop |
| `session_cleanup_schedule` (stack) | `cron(5 21 * * ? *)` | used only when enabled |
| `identity_probe_account` (stack) | `throwaway` | used only when the probe is pinned |

## 2. How the counts were reproduced

The counts above come from reading each `count`/`for_each` gate in the diff (`git diff 68fa6f9`)
and from the mocked Terraform runs, which assert the resource lengths for both settings:
`tests/session-cleanup.tftest.hcl` runs `merging_the_cleanup_changes_no_nonprod_plan` (all eight
lengths 0) and `enabled_cleanup_is_scoped_and_complete` (all eight lengths 1, backstop policy 3
statements instead of 2); `bootstrap/tests/bootstrap.tftest.hcl` runs `be2_session_cleanup_is_off_by_default`
and `be2_session_cleanup_widens_only_nonprod`. A mocked `terraform test` cannot print planned
actions for resources that already exist in the real state, so "update" (boundary, session-read
policy, backstop policy) is inferred from the resources being existing ones whose document changes
when the flag is set. A real plan (D-B2, D-B3) is the confirmation.

## 3. IAM security properties verified

- **Deletion scope.** The cleanup role can delete one secret ARN form (`munaxa-nonprod/identity-bootstrap-??????`;
  IAM `?` is one character, so `identity-operator`, `munaxa-nonprod/identity` and `rds!…` cannot
  match), enforced three times: the role's allow, the role's `NotResource` deny, the boundary.
  ALB deletion needs the name path `loadbalancer/app/munaxa-nonprod/*` **and** the tags
  `Project=munaxa`, `Environment=nonprod`. No secret value action is allowed anywhere (explicit deny).
- **Trust.** Cleanup role: `states.amazonaws.com`, `aws:SourceAccount`, `aws:SourceArn` = the one
  state machine. The deployer may pass only this role and only to Step Functions.
- **Execution input cannot redirect it.** Targets are fixed by `templatefile()`; the `Config` state
  keeps only the boolean `dryRun`.
- **Prod and management.** Nothing in the PR names a prod resource except the cleanup role's
  `NeverProduction` deny. The account is the Organizations management account; no SCP, Organizations
  or account-level resource is touched.
- **Privilege escalation.** The nonprod deployer already manages nonprod roles, policies and
  schedules within the same boundary; the cleanup adds no permission the deployer did not already
  hold within the boundary (see Low B-4 for the residual).

## 4. Low findings accepted (with residual risk)

| ID | Finding | Why accepted | Residual risk |
| --- | --- | --- | --- |
| B-3 | The existing backstop scheduler role's trust has `aws:SourceAccount` but no `aws:SourceArn`; with `StartTheSessionCleanup` any schedule in the account that is given the role can start the cleanup | Starting the cleanup only runs the fixed cleanup (input is reduced to `dryRun`). Changing the backstop trust now would add an update to every stack plan and risks the S-1 class of failure in the scheduled `down` | An extra cleanup run at a wrong time could delete the session ALB during a session. Recommended follow-up: `ArnLike aws:SourceArn arn:aws:scheduler:eu-central-1:229251310592:schedule/default/munaxa-nonprod-*` in its own reviewed PR |
| B-4 | The deployer can rewrite the cleanup definition and the cleanup role's policy up to the boundary, which still allows `GetSecretValue` on `munaxa-nonprod/*`; a Step Functions run carries no source identity, so the deployer-session denies do not apply | The same was already possible through a scheduler plus `RunTask` with a task role; not a new capability class | A compromised nonprod deployer could read `identity-operator`. Recommended follow-up (owner decision): a root-applied resource policy on `munaxa-nonprod/identity-operator` denying `GetSecretValue` to everyone except the named readers |
| B-5 | `sns:CreateTopic` and `states:CreateStateMachine` are not in the deployer's `tagged_creates`; `sns:SetTopicAttributes` can write any topic policy on `munaxa-nonprod-*` topics | Only nonprod names; the topic carries alarm names and states only | An untagged nonprod topic or state machine; a topic policy opened to another account would leak alarm names. Follow-up with B-3 |
| B-6 | `secretsmanager:ListSecrets` on `*` in the shared nonprod boundary exposes secret names, tags and descriptions of the whole account (prod and Docs included) to any nonprod role later granted it; the execution history keeps the listed metadata and the region's load balancer page | `ListSecrets` has no resource-level permission; only the cleanup role is granted it; no value is exposed | Metadata only. A future nonprod role must not be granted `ListSecrets` |
| A-sim | The `DescribeLoadBalancers` page (up to 400 load balancers) is kept in the state data; Step Functions limits a state's data to 256 KB (`States.DataLimitExceeded`, not catchable by `States.ALL`) | The account holds a handful of load balancers | If the account ever holds a few hundred load balancers the cleanup would fail as a whole (loudly: the failed alarm). Revisit then |

## 5. Not verified offline (unchanged [U] items, each fails closed)

The aws-sdk integration's real response field casing and error names (now guarded so that a
mismatch is a per-branch "unexpected" result, never a whole-execution `States.Runtime`; owner
review A-1/A-2), `DescribeTaskDefinition` field shapes as E-1 sees them through the connector, and
the real plan output. All are first exercised by D-B4 (dry run, which should be repeated once with
a session up so the present-resource paths run, see file 13) and the first E-1 `discover`.
