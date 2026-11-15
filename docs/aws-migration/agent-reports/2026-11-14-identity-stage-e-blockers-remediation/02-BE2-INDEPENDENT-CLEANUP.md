# BE-2: the independent session cleanup, built (not deployed)

Status: **BUILT IN THE REPOSITORY, OFF BY DEFAULT, NOT APPLIED.** Merging changes no plan in
either environment (tests prove it). Turning it on is two owner-approved applies (section 7).

## 1. What it closes

`backstop.tf` (21:00 UTC) stops the database and scales services to 0, but it cannot delete the
ALB (its ARN changes every session) or the one-run bootstrap secret. If Claude loses control of a
session and every scheduled `down` is dropped, the ALB costs about US$0.89 a day without limit
(PR #95 X-6). PR #90 designed an in-AWS cleanup (option 3, revision 2, no Lambda); this builds it.

## 2. Ownership

| Thing | Owner | Created by |
| --- | --- | --- |
| State machine, its role and inline policy, daily schedule R, SNS topic, two alarms | Terraform, `infra/aws/stack/session-cleanup.tf` (nonprod only) | stack apply (owner-approved) |
| Boundary allowance, deployer policy, session-read additions | Terraform, `infra/aws/bootstrap` (`testing_session_cleanup`) | root bootstrap apply (owner) |
| Per-session one-time schedules P (at hard stop H) and S (H + 30 min) | the session operator (Claude via connector, H-20) | `scripts/aws/connector/h20-session-cleanup-gate-and-arm.py`, before `up`; they delete themselves after firing |
| Alarm email subscription | the owner | outside Terraform (no address in the public repository) |

## 3. Design

Step Functions **Standard**, JSONPath ASL (`infra/aws/stack/session-cleanup/definition.asl.json`),
AWS SDK service integrations only, `TimeoutSeconds` 900. Input `{"dryRun": true|false}`; anything
else fails at once (`BadInput`, nothing touched). Four independent branches in a `Parallel`; each
catches its own errors and returns `{component, ok, status, …}`:

| Branch | Discovery | Safety checks before acting | Action | Retries |
| --- | --- | --- | --- | --- |
| secret | `ListSecrets` (name filter, planned deletions included), then a JSONPath filter for the exact name `munaxa-nonprod/identity-bootstrap` | exactly one; ARN matches `…:secret:munaxa-nonprod/identity-bootstrap-*` in this account (Choice `StringMatches` knows only `*`; fix-check finding N-2); a second page = not ok | `DeleteSecret` on that ARN, `ForceDeleteWithoutRecovery` | none found = `absent` (ok); already pending deletion = `pending-deletion` (ok, reported) |
| alb | `DescribeLoadBalancers` (all, page size 400), then a JSONPath filter for the name `munaxa-nonprod` | exactly one; `Type` application, `Scheme` internet-facing, `VpcId` = this stack's VPC, ARN matches `…loadbalancer/app/munaxa-nonprod/*`; a second page = not ok | `DeleteLoadBalancer`, then poll (8 × 10 s, same list and filter) until gone | none found = `absent` (ok); still present = not ok |
| ecs | `DescribeServices` for the ten service names in cluster `munaxa-nonprod` (Map, concurrency 2) | per service: missing/inactive = ok, already 0 = ok | `UpdateService desiredCount 0`; `ListTasks RUNNING` (100), `StopTask` each | a `NextToken` (more than 100 tasks) = not ok |
| database | `DescribeDBInstances` `munaxa-nonprod-pg` | `stopped`/`stopping` = ok; `available` = stop; `starting`, `backing-up`, `modifying`, … = wait 60 s, up to 10 tries | `StopDBInstance` | a race (`InvalidDBInstanceState`) re-describes; missing = not ok |

Secret and ALB are **listed and filtered**, not described by name, so the normal state between
sessions (nothing there) is an empty list and never depends on a "not found" error name matching
(review finding C-5). Every Task state: `States.ALL` × 2 with backoff 2 (the database states keep
a not-found retrier with `MaxAttempts 0` first), then a Catch to an error result. An **unknown** error name is
never mapped to success. `Evaluate` → `SUCCEEDED` only when all four are ok; otherwise
`FAILED` with error `CleanupIncomplete` and a cause listing component statuses and AWS error
names, never a value. Dry run: every branch stops at its check and reports `would-delete`,
`would-scale`, `would-stop`.

## 4. Permissions (least privilege, three layers)

1. The role's inline policy (`session-cleanup.tf`): allow `DeleteSecret` on
   `munaxa-nonprod/identity-bootstrap-??????` only and `ListSecrets` on `*` (names and metadata,
   no resource-level permission exists); **deny** `DeleteSecret` on every other secret
   (`NotResource`), **deny** every value action (`Get/BatchGet/Put/UpdateSecret`) on `*`;
   `DeleteLoadBalancer` only on `loadbalancer/app/munaxa-nonprod/*` **with** tags `Project=munaxa`
   and `Environment=nonprod`; `DescribeServices/UpdateService` on `service/munaxa-nonprod/*`;
   `ListTasks/StopTask` with `ecs:cluster` = the nonprod cluster; `Describe/StopDBInstance` on
   `db:munaxa-nonprod-pg`; **deny** everything on `munaxa-prod*` secrets, ALBs, services, tasks,
   clusters and databases.
2. The trust policy: `states.amazonaws.com` with `aws:SourceAccount` and `aws:SourceArn` = this
   state machine.
3. The nonprod workload boundary (bootstrap, nonprod key only): the same actions on nonprod names;
   the three lookups (`DescribeLoadBalancers`, `ListTasks`, `ListSecrets`) on `*`.

No management-account or Organizations action, no IAM action, no KMS action, no network change.
The backstop scheduler role gains one statement: `states:StartExecution` on this state machine.

## 5. Alarms and failure reporting

- `munaxa-nonprod-session-cleanup-failed`: `ExecutionsFailed + ExecutionsTimedOut +
  ExecutionsAborted ≥ 1` in 5 minutes.
- `munaxa-nonprod-session-cleanup-not-run`: `ExecutionsSucceeded < 1` over 86 400 s, missing
  data breaching (R itself broken).
- Both publish to `munaxa-nonprod-session-cleanup-alerts` (unencrypted: names and states only;
  a TLS-only deny in the topic policy). The execution history keeps every branch result.

## 6. Tests (all offline)

- `session-cleanup/asl_simulator.py`: a strict interpreter of the ASL subset used (Pass, Task,
  Choice, Wait, Parallel, Map, Succeed, Fail; JSONPath, filters, intrinsics; Retry and Catch with
  `States.ALL` not matching `States.Runtime`; a simulated clock with `TimeoutSeconds`).
- `session-cleanup/test_session_cleanup.py`, 30 tests (the simulator's `StringMatches` treats only `*` as a wildcard, like Step Functions): nothing left (with another load balancer in
  the Region, and no not-found error used); dry run changes nothing; a
  lost session (everything up); **duplicate execution** (second run all absent/ok); concurrent
  `down`; **partial failure** (one branch denied, others still act, overall FAILED); the cause
  carries codes only; throttling retried; a task timeout; **unexpected resources** (ALB in another
  VPC, internal scheme, network LB, two ALBs, more than one page, a longer secret name, a foreign
  secret ARN, a secret pending deletion);
  ALB lingering after delete; one service failing; more than 100 tasks; DB starting, stuck (11
  describes then not ok), racing, **missing**; bad input; an unknown error name; worst-case time
  under 900 s. A mutation check confirmed the tests catch a removed VPC check and a removed Catch.
- `tests/session-cleanup.tftest.hcl`, 5 runs: merging changes no nonprod plan; the backstop
  policy is unchanged while off; the variable needs nonprod and the backstop; never in prod;
  enabled = exactly the 8 resources, scoped as above.
- `infra/aws/bootstrap/tests/bootstrap.tftest.hcl`, 2 new runs: off by default; on widens nonprod
  only.
- `scripts/aws/connector/test_session_cleanup_arm.py`, 18 tests for H-20 (below).

## 7. Exact Terraform changes prepared (NOT applied, NOT planned against AWS)

**B-2, bootstrap (root, CloudShell), `testing_session_cleanup = true`:**

| Address | Action |
| --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` | update in place (two statements appended; the lookups statement now includes `secretsmanager:ListSecrets`) |
| `aws_iam_policy.deployer_session_read["nonprod"]` | update in place (`RefreshSessionCleanup`) |
| `aws_iam_policy.deployer_session_cleanup[0]` | create |
| `aws_iam_role_policy_attachment.deployer_session_cleanup[0]` | create |

**B-3, stack nonprod, `session_cleanup_enabled = true` in `envs/nonprod.tfvars` (a configuration
PR with its own `envs/nonprod.expected-changes.json` declaration):** 8 creates
(`aws_iam_role.session_cleanup[0]`, `aws_iam_role_policy.session_cleanup[0]`,
`aws_sfn_state_machine.session_cleanup[0]`, `aws_scheduler_schedule.session_cleanup_daily[0]`,
`aws_sns_topic.session_cleanup_alerts[0]`, `aws_sns_topic_policy.session_cleanup_alerts[0]`,
`aws_cloudwatch_metric_alarm.session_cleanup_failed[0]`,
`aws_cloudwatch_metric_alarm.session_cleanup_not_run[0]`) and 1 update
(`aws_iam_role_policy.session_backstop[0]`). The session must be down; the session workflow
refuses non-session changes, so this is a normal `aws-terraform.yml` apply.

**B-4, dry run:** start one execution with `{"dryRun": true}` (connector, owner-approved) and read
its output. This validates the **[U]** items below against the real service before any real run.

**B-5:** the owner subscribes an email address to the topic (outside the repository).

## 8. The session procedure (H-20)

`scripts/aws/connector/h20-session-cleanup-gate-and-arm.py`:

- `gate` (read-only): the state machine is ACTIVE; its last SUCCEEDED execution ended within 26 h
  **and was a real run** (`DescribeExecution` input `dryRun false`; a dry run proves nothing about
  the delete permissions); **no execution is RUNNING** (a running cleanup would delete the new
  session's ALB); R is ENABLED and targets the state machine with `dryRun false`; both alarms exist
  and neither is in ALARM; **no P or S schedule of an earlier session is still waiting**
  (`ListSchedules`; review finding S-3: it would delete this session's ALB and stop its tasks).
  With `HARD_STOP_UTC` set, that session's own P and S pass. Any failure: `up` must not run.
- `arm`: H must be 1 to 6 hours ahead, and S must end before the 21:00 UTC backstop (R runs at
  21:05 UTC and would delete a live session's ALB); the gate again; then P (`at(H)`) and S (`at(H+30m)`),
  UTC, flexible window OFF, `ActionAfterCompletion DELETE`, the backstop role, retry 3 × within
  1 h. Idempotent (a fixed `ClientToken` per name; an identical existing schedule is
  `already-armed`; a different one aborts with `conflict`). A partial arm is reported and a rerun
  completes it.
- `disarm`: only after `down` is verified complete; deletes every leftover P and S schedule (exact
  name pattern `munaxa-nonprod-session-cleanup-{p|s}-YYYYMMDDtHHMM`, nothing else).

Interaction with the session workflow: if the cleanup deletes the ALB, the next session plan's
refresh finds it gone and drops it from state; nothing else in state is touched.

## 9. Unverified items [U] (checked by the B-4 dry run, fail closed meanwhile)

- The Step Functions error names still used (`SecretsManager.ResourceNotFoundException` on a delete
  race, `Ecs.ServiceNotFoundException`, `Ecs.ServiceNotActiveException`,
  `Rds.DbInstanceNotFoundException`, `Rds.InvalidDbInstanceStateException`) and the response field
  casing (`SecretList`, `LoadBalancers`, `NextMarker`, `DbInstances`, `DbInstanceIdentifier`). The
  normal between-sessions path no longer depends on an error name (C-5). If a name or field
  differs, that branch reports `error` or `unexpected` (not ok) and the execution FAILS: never a
  false success.
- JSONPath filter expressions in `ResultSelector`/`Choice` as the simulator implements them.
