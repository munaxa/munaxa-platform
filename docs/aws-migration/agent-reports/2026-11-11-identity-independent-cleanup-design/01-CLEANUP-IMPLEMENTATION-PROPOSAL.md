# Independent session cleanup: implementation proposal for option 3, revision 2 (11 Nov 2026)

- Requested by the owner: first at 10:30 UTC, 11 Nov 2026 ("Fast-Track Final Preparation and Approval Package", section 4); this revision answers the owner's 11:18 UTC corrections ("Final Pre-Merge Corrections", item 3).
- This proposal extends `00-IDENTITY-INDEPENDENT-CLEANUP-DESIGN.md` (option 3, recommended).
- Account `229251310592`, region `eu-central-1`. Base: `main` `49c51f3`.
- **Proposal only. Nothing is implemented.** No Terraform file, IAM statement, state machine, schedule, alarm, topic or other AWS resource was added or changed. No AWS call was made for this document.
- **No design here enforces a guaranteed cost ceiling.** Every bound in section 9 holds only while the named mechanism runs and succeeds. Section 9 states each case, including the one with no fixed upper limit.

Labels:

- **[V]** verified in the repository today;
- **[U]** unverified, to be checked in the build PR;
- **[O]** owner authorization required.

## 0. What changed from revision 1

| Revision 1 | Problem (owner, 11:18 UTC) | Revision 2 |
| --- | --- | --- |
| One schedule at T0 + 2 h 55 min | Undefined relation to the hard stop | Fires **at the hard stop H** (section 1), plus a retry at **H + 30 min** and a **daily run at 21:05 UTC** |
| Six steps in sequence; RDS retries up to 60 min | ALB deletion and the report could wait behind RDS retries | **Four parallel branches**: the ALB branch never waits for RDS. The RDS branch retries for at most 10 min |
| State machine timeout 90 min | No maximum cleanup duration | **Maximum execution 15 min** (`TimeoutSeconds = 900`); the result is reported by H + 15 min |
| `FAILED` visible only in the console | Failures not reported | Execution output per branch, plus a CloudWatch alarm on failed or timed-out executions that emails the owner |
| One attempt | Could leave the ALB running indefinitely | Three independent attempts (H, H + 30 min, 21:05 UTC daily). Section 8 states the remaining case honestly |
| Cost "about US$0.30 to 0.35" | Not tied to the actual duration | Recalculated from the actual timings (section 9) |

## 1. Hard-stop semantics

| Symbol | Definition |
| --- | --- |
| **T0** | The time Claude dispatches `aws-session.yml up`, after gate H-20 has passed. Recorded in the session log |
| **H** | **The hard stop: T0 + 3 h 00 min or 18:30 UTC, whichever is earlier** (runbook section 14, H-15) |
| T0 + 2 h 30 min | Claude's wrap-up warning: no new step that changes data starts after this |
| T0 + 2 h 45 min (or H − 15 min) | Claude deletes the bootstrap secret (C-16) and dispatches `down` |
| **H** | **By H, `down` must have been dispatched.** At H, AWS itself starts the cleanup, whether or not Claude is still connected (primary schedule P) |
| **H + 15 min** | **Cleanup deadline.** The primary execution has ended by then (`TimeoutSeconds = 900`), either `SUCCEEDED` (everything gone or stopped) or `FAILED` with what remains, and an alarm has been raised |
| H + 30 min | Retry schedule S starts the same cleanup again (idempotent) |
| 21:05 UTC daily | Recurring schedule R starts the same cleanup again, every day |

A session starts no later than 15:30 UTC (runbook section 14), so H is no later than 18:30 UTC. S fires no later than 19:00 UTC. The daily run R at 21:05 therefore never meets a running session.

## 2. Architecture

```
before `up` (Claude, root via connector)       at H, H + 30 min, and 21:05 UTC daily (AWS only)
----------------------------------------       -----------------------------------------------------
CreateSchedule P  at(H)        DELETE after    EventBridge Scheduler --(states:StartExecution,
CreateSchedule S  at(H+30min)  DELETE after      role session-backstop)-->
GetSchedule P, S, R; DescribeStateMachine
  -> gate H-20 for `up`                        Step Functions Standard munaxa-nonprod-session-cleanup
                                               TimeoutSeconds 900
R (Terraform, recurring) cron(5 21 * * ? *)      Parallel (each branch catches every error itself)
                                                   A secret  -> delete bootstrap secret (exact name)
                                                   B alb     -> describe by name, delete, confirm gone
                                                   C ecs     -> scale 10 services to 0, stop all tasks
                                                   D rds     -> stop; retry 60 s x 10 at most
                                                 Verify    -> SUCCEEDED, or Fail CleanupIncomplete
                                               CloudWatch alarm on ExecutionsFailed / TimedOut
                                                 -> SNS topic -> owner email (subscribed by root)
```

The design has no Lambda, no custom code, no network access and no new security group. Every step calls the AWS SDK through Step Functions' service integrations (`arn:aws:states:::aws-sdk:<service>:<action>`).

The existing 21:00 UTC backstop (`backstop.tf`: RDS stop and scale-in, its own schedules) stays **unchanged**. It is a separate path that still works if the state machine is broken.

## 3. Execution sequence and maximum duration

The four branches run at the same time inside one `Parallel` state. **Every branch catches every error itself and returns a status object**, so one branch's failure never cancels another. In particular, the ALB branch never waits for the RDS branch.

| Branch | Calls | Retry and timeout | Normal duration | Branch result |
| --- | --- | --- | --- | --- |
| A secret | `DescribeSecret munaxa-nonprod/identity-bootstrap`; if `Name` is exactly that, `DeleteSecret` on the returned **ARN** with `ForceDeleteWithoutRecovery` | 3 tries, interval 5 s, backoff 2; branch `TimeoutSeconds = 120` | seconds | `deleted`, `absent` or `error:<code>` |
| B alb | `DescribeLoadBalancers Names=["munaxa-nonprod"]`; if exactly one `internet-facing` result with that name, `DeleteLoadBalancer` on its ARN; then up to 6 polls of `DescribeLoadBalancers` 10 s apart until `LoadBalancerNotFound` | 3 tries per call, interval 10 s; branch `TimeoutSeconds = 240` | under 2 min | `deleted`, `absent` or `error:<code>` / `still-present` |
| C ecs | `Map` over the 10 backstop service names: `UpdateService DesiredCount=0` (not found counts as done); `ListTasks cluster munaxa-nonprod` (paginated); `Map` `StopTask` | 3 tries per call; branch `TimeoutSeconds = 300` | under 3 min | `services_scaled: n`, `tasks_stopped: n`, `errors: [names]` |
| D rds | `StopDBInstance munaxa-nonprod-pg`; on `InvalidDBInstanceState`, `DescribeDBInstances`: `stopped` or `stopping` means done; `starting`, `backing-up` or `modifying` means wait 60 s and try again | **at most 10 retries (10 min)**; branch `TimeoutSeconds = 660` | seconds (the database has been `available` for hours by H) | `stopping`, `stopped` or `still-running:<status>` / `error:<code>` |
| Verify | after all four: `DescribeSecret` (expect not found), `DescribeLoadBalancers` by name (expect not found), `ListTasks` (expect 0), `DescribeServices` (expect desired 0), `DescribeDBInstances` (expect `stopping` or `stopped`) | `TimeoutSeconds = 120` | seconds | `SUCCEEDED` with the four branch results; otherwise `Fail` with `Error = CleanupIncomplete` and `Cause` listing what remains (names and states only, never a value) |

**Maximum cleanup execution duration: 15 min** (state machine `TimeoutSeconds = 900`). The longest branch (D, 11 min) plus Verify (2 min) fits inside it. An execution that hits 900 s ends `TIMED_OUT`, which raises the same alarm as `FAILED`.

**When the ALB is gone:** normally by H + 2 min, at the latest by H + 4 min (branch B timeout), independent of RDS.

## 4. What happens if RDS is still running after the cleanup deadline

1. Branch D returns `still-running:<status>`, Verify fails with `CleanupIncomplete: database munaxa-nonprod-pg <status>`, and the alarm emails the owner (section 6).
2. The retry schedule S runs the whole cleanup again at H + 30 min.
3. The existing backstop stops the database at 21:00 UTC through its own path, and the daily run R tries again at 21:05 UTC.
4. Cost while the database alone keeps running: about US$0.019 an hour (US$0.46 a day) [U on price].
5. A database left in `starting`, `backing-up` or `modifying` for more than about 2.5 hours (H to 21:00) is outside normal behaviour. Claude reports it to the owner at the next session, and the next preflight finds it before any new `up`.

## 5. IAM: roles, trust and permissions

**Role 1 (new): `munaxa-nonprod-session-cleanup`.**

- Path `/munaxa-shared/`.
- Boundary `munaxa-shared-workload-boundary`.
- Trust: `states.amazonaws.com`, with `aws:SourceAccount = 229251310592` and `aws:SourceArn` = the state machine ARN.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BootstrapSecretOnly",
      "Effect": "Allow",
      "Action": ["secretsmanager:DescribeSecret", "secretsmanager:DeleteSecret"],
      "Resource": "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-bootstrap-??????"
    },
    {
      "Sid": "NeverThePersistentSecret",
      "Effect": "Deny",
      "Action": "secretsmanager:*",
      "Resource": "arn:aws:secretsmanager:eu-central-1:229251310592:secret:munaxa-nonprod/identity-operator-*"
    },
    {
      "Sid": "ScaleInAndStopTasks",
      "Effect": "Allow",
      "Action": ["ecs:UpdateService", "ecs:DescribeServices", "ecs:StopTask"],
      "Resource": [
        "arn:aws:ecs:eu-central-1:229251310592:service/munaxa-nonprod/*",
        "arn:aws:ecs:eu-central-1:229251310592:task/munaxa-nonprod/*"
      ],
      "Condition": { "ArnEquals": { "ecs:cluster": "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" } }
    },
    {
      "Sid": "ListTasksInCluster",
      "Effect": "Allow",
      "Action": "ecs:ListTasks",
      "Resource": "*",
      "Condition": { "ArnEquals": { "ecs:cluster": "arn:aws:ecs:eu-central-1:229251310592:cluster/munaxa-nonprod" } }
    },
    {
      "Sid": "FindTheAlb",
      "Effect": "Allow",
      "Action": "elasticloadbalancing:DescribeLoadBalancers",
      "Resource": "*"
    },
    {
      "Sid": "DeleteOnlyTheNonprodAlb",
      "Effect": "Allow",
      "Action": "elasticloadbalancing:DeleteLoadBalancer",
      "Resource": "arn:aws:elasticloadbalancing:eu-central-1:229251310592:loadbalancer/app/munaxa-nonprod/*"
    },
    {
      "Sid": "StopTheDatabase",
      "Effect": "Allow",
      "Action": ["rds:StopDBInstance", "rds:DescribeDBInstances"],
      "Resource": "arn:aws:rds:eu-central-1:229251310592:db:munaxa-nonprod-pg"
    }
  ]
}
```

**Role 2 (existing, extended): `munaxa-nonprod-session-backstop`.** Its trust is already `scheduler.amazonaws.com` with `aws:SourceAccount` [V, `backstop.tf`]. One statement is added, used by P, S and R:

```json
{
  "Sid": "StartTheCleanup",
  "Effect": "Allow",
  "Action": "states:StartExecution",
  "Resource": "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"
}
```

**Alarm and topic.** CloudWatch publishes to an unencrypted SNS topic in the same account without a role. The topic policy allows `cloudwatch.amazonaws.com` to publish, with `aws:SourceAccount`.

**The boundary (bootstrap, root apply).** The `TestingBackstop` statement (`infra/aws/bootstrap/iam.tf` lines 157-165) [V] today allows only `rds:StopDBInstance` and `ecs:UpdateService`. It is extended with:

- the role 1 actions above, on the same nonprod-only resources;
- `states:StartExecution` on `stateMachine:munaxa-nonprod-*`.

**The deployer (bootstrap, root apply).** The deployer has no `states:` or `sns:` permissions today. Its `PassOwnRoles` lists only `ecs-tasks`, `ecs` and `scheduler` [V, `iam_allow.tf` lines 261, 397-405]. Three changes are needed:

- add `states:*` on `stateMachine:munaxa-nonprod-*`;
- add `sns:*` on `munaxa-nonprod-*` topics (`cloudwatch:*` and `scheduler:*` are already allowed);
- add `states.amazonaws.com` to `PassOwnRoles`.

The session deployer (`iam_session.tf`) does not change.

**Arming permissions.** Root, through the connector, needs `scheduler:CreateSchedule`, `GetSchedule`, `DeleteSchedule` and `iam:PassRole` for role 2. Root already has them. No IAM user, access key or Identity Center change is involved.

## 6. Failure reporting (ECS, database and every other branch)

1. **Execution output.** Each branch returns its status object, for example `{"ecs": {"services_scaled": 1, "tasks_stopped": 2, "errors": ["work-api: AccessDenied"]}}`, kept in the Step Functions execution history (names, counts and error codes only).
2. **Execution status.** `SUCCEEDED` only when Verify finds nothing left. Otherwise `FAILED` (`CleanupIncomplete`, with the remainder) or `TIMED_OUT`.
3. **Alarm, new.** A CloudWatch alarm `munaxa-nonprod-session-cleanup-failed` on the state machine's `ExecutionsFailed` + `ExecutionsTimedOut` (sum ≥ 1 in 5 min) publishes to SNS topic `munaxa-nonprod-session-cleanup-alerts`.
   - The owner's email is subscribed **by root through the connector at Stage B**, using the value from the private runtime input. It is never in Terraform or the repository.
   - The owner confirms the subscription by clicking the link in AWS's confirmation email (owner action, once).
4. **CloudTrail.** Every delete, scale and stop call by `munaxa-nonprod-session-cleanup`, with error codes.
5. **Next preflight.** Before any new `up`, Claude reads the most recent P, S and R execution statuses and the account state. Any `FAILED` or `TIMED_OUT` execution, or anything left running, blocks `up` (H-20).

## 7. Arming and verification before `up` (gate H-20)

One connector call by Claude, after the Stage D authorization, before `aws-session.yml up` is dispatched:

```python
# H = min(T0 + 3h, 18:30 UTC on the session date); T0 = planned dispatch time of `up`.
for name, at in ((f"munaxa-nonprod-cleanup-{T0:%Y%m%dT%H%MZ}-p", H),
                 (f"munaxa-nonprod-cleanup-{T0:%Y%m%dT%H%MZ}-s", H + timedelta(minutes=30))):
    CreateSchedule(Name=name, ScheduleExpression=f"at({at:%Y-%m-%dT%H:%M:%S})",
                   ScheduleExpressionTimezone="UTC", FlexibleTimeWindow={"Mode": "OFF"},
                   ActionAfterCompletion="DELETE",
                   Target={"Arn": STATE_MACHINE_ARN, "RoleArn": BACKSTOP_ROLE_ARN,
                           "Input": json.dumps({"session": f"{T0:%Y%m%dT%H%MZ}", "attempt": name[-1]}),
                           "RetryPolicy": {"MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 900}})
```

**Gate H-20:** `up` is not dispatched unless every item below is true. The check returns metadata only.

1. `GetSchedule` P and S: `State = ENABLED`, the exact `at(...)` times, target ARN, role ARN, `ActionAfterCompletion = DELETE`.
2. `GetSchedule` R (`munaxa-nonprod-session-cleanup-daily`): `ENABLED`, `cron(5 21 * * ? *)`.
3. `DescribeStateMachine`: `ACTIVE`, the expected definition revision.
4. The last R execution ended `SUCCEEDED`. This is a daily proof that the scheduler, the role and the read paths work.
5. The alarm exists in state `OK`, and the SNS subscription is `Confirmed`.
6. Claude records T0, H and both schedule names in the session log.

If `up` is then delayed by more than 5 min past the planned T0, Claude deletes P and S and re-arms them for the new T0 before dispatching.

## 8. Can the cleanup leave the ALB running indefinitely?

- **While at least one of P, S or R works, no.** The ALB is deleted at the first successful run: normally by H + 2 min; if P fails, by H + 32 min; if both P and S fail, by 21:07 UTC that day; after that, at each daily R.
- **The remaining case: the mechanism itself is persistently broken.** Examples are a later IAM change, a deleted state machine, or a regional Step Functions or Scheduler outage. Then no attempt succeeds, and **the ALB keeps costing about US$0.89 a day with no fixed upper limit** until someone runs `down`. Two things make that visible rather than silent:
  - the alarm emails the owner after every failed or timed-out execution, including each daily R;
  - gate H-20 blocks every later `up`.
- **No AWS-native control can enforce an absolute cost ceiling for an ALB.** AWS Budgets actions cannot delete an ALB (design report, section 4). This proposal does not claim a guaranteed ceiling.

## 9. Cost recalculated from the actual cleanup timing

The rates are the 10 Nov estimates and were not re-priced today [U]:

| Item | Rate |
| --- | --- |
| ALB with its 2 public IPv4 addresses | about US$0.037 an hour |
| Identity service (Fargate, Valkey sidecar, 1 public IPv4) | about US$0.033 an hour |
| Database | about US$0.019 an hour |
| **Total running** | **about US$0.09 to 0.10 an hour** |

Billing granularity [U]: ALB and public IPv4 by the hour or partial hour; Fargate per second (1 min minimum); RDS per second (10 min minimum).

| Case | When resources are gone | Approximate session cost |
| --- | --- | --- |
| 1. Normal session, about 2 h, Claude's `down` | about T0 + 2 h 10 min | **about US$0.20** |
| 2. Normal session to the hard stop (`down` dispatched at H − 15 min, finished by about H − 5 min) | about H | **about US$0.26 to 0.30** |
| 3. Claude lost after `up`; P succeeds at H (ALB gone by H + 2 min, service by H + 3 min, database stopping by H + 5 min) | about H + 5 min | **about US$0.31**, up to about US$0.35 with the ALB's fourth partial hour |
| 4. Claude lost; P fails or does not fire; S succeeds at H + 30 min | about H + 35 min | **about US$0.33 to 0.40** |
| 5. Claude lost; P and S fail; the 21:00 backstop and R at 21:05 succeed | 21:07 UTC | **about US$0.09 to 0.10 × hours from T0 to 21:05 UTC.** For a 15:30 start (the latest allowed): about 5.6 h, **about US$0.50 to 0.56**. For a 12:00 start: about 9.1 h, **about US$0.82 to 0.91** |
| 6. RDS alone keeps running after a run that deleted the ALB and stopped the service | next successful stop | adds about US$0.019 an hour; at most to the 21:00 backstop on the same day, **about US$0.05**, if that works |
| 7. The mechanism is persistently broken (section 8) | until someone runs `down` | **no fixed upper limit:** case 5, then about US$0.89 a day for the ALB. The 21:00 backstop still stops the database and services on its own path. The owner is emailed daily |
| Per execution of the cleanup | — | under US$0.01 (Step Functions Standard, about 30 to 50 state transitions; Scheduler and SNS free tier) |
| Alarm | — | about US$0.10 a month (one standard alarm) |
| Daily run R | — | about 30 executions a month; inside the Step Functions free tier of 4,000 transitions a month, else about US$0.04 a month |

Before this proposal, without any independent cleanup, case 3 cost about US$1.00 when a scheduled `down` ran, and had no fixed upper limit when both were dropped.

## 10. How each target is identified

- **Bootstrap secret:** `DescribeSecret` by the exact name, a name equality check, then the delete by ARN. The `Allow` matches only that name plus the 6-character suffix. An explicit `Deny` covers the persistent secret.
- **ECS services:** the fixed list of 10 nonprod service names used by `backstop.tf`, in cluster `munaxa-nonprod`, limited by the `ecs:cluster` condition.
- **ECS tasks:** every task in cluster `munaxa-nonprod`. That catches a hung one-off task and its public IPv4.
- **ALB:** found by the name `munaxa-nonprod`, because the ALB ARN changes every session. The name check and the resource pattern `loadbalancer/app/munaxa-nonprod/*` together exclude every other load balancer.
- **RDS:** the fixed identifier `munaxa-nonprod-pg`.

## 11. Proving it before the first session (Stage B)

- `terraform test` cases with the mocked provider:
  - four parallel branches, each with a `Catch` on `States.ALL`;
  - branch and state machine timeouts as in section 3;
  - the delete targets are the fixed names;
  - the role policy holds only section 5;
  - the `Deny` on the persistent secret is present;
  - R's expression is `cron(5 21 * * ? *)`.
- `SimulatePrincipalPolicy` on both roles with the boundary: every allowed action and resource, plus expected denies for `munaxa-nonprod/identity-operator`, a `munaxa-prod` ARN and an ALB of another name.
- One manual execution, started by root with nothing running. Expected `SUCCEEDED` with every branch `absent`. The daily R then repeats that proof every evening.
- The delete paths themselves are proven only when something is left to delete. They are first exercised when a session's P runs after Claude's `down`, which is normally `absent` too, or when Claude is actually lost.

## 12. Terraform changes (one build PR, after Stage B approval)

| Root | Address | Change |
| --- | --- | --- |
| `infra/aws/stack` | `aws_sfn_state_machine.session_cleanup[0]` | create (Standard, `TimeoutSeconds = 900`, definition from `templatefile` with fixed names) |
| `infra/aws/stack` | `aws_iam_role.session_cleanup[0]` | create (trust `states.amazonaws.com`, boundary as today) |
| `infra/aws/stack` | `aws_iam_role_policy.session_cleanup[0]` | create (section 5, role 1) |
| `infra/aws/stack` | `aws_scheduler_schedule.session_cleanup_daily[0]` | create (R, `cron(5 21 * * ? *)`, role 2) |
| `infra/aws/stack` | `aws_sns_topic.session_cleanup_alerts[0]`, `aws_sns_topic_policy.session_cleanup_alerts[0]` | create (no subscription in Terraform) |
| `infra/aws/stack` | `aws_cloudwatch_metric_alarm.session_cleanup_failed[0]` | create |
| `infra/aws/stack` | `aws_iam_role_policy.session_backstop[0]` | update in place (adds `StartTheCleanup`) |
| `infra/aws/bootstrap` | boundary `munaxa-shared-workload-boundary` (nonprod) | update in place |
| `infra/aws/bootstrap` | deployer policy (nonprod) | update in place |

- **Gating.** All stack resources sit behind `session_cleanup_enabled` (default `false`), so merging the PR changes no plan. Enabling it is a configuration PR with its own apply.
- **Expected changes:**
  - stack apply: **7 creates, 1 update**;
  - bootstrap apply: **2 updates**, by root, first;
  - outside Terraform: **1 SNS email subscription** (root, connector, Stage B).
- P and S are per-session and are not Terraform resources. They are created by root at arming and delete themselves after firing.

## 13. Owner approvals required (Stage B, separate from A, C and D)

None of these is given today.

1. **B-1:** approval to open and merge the build PR (Terraform, tests, runbook H-20 gate in this revision's form). This is a code merge.
2. **B-2:** approval for the **bootstrap** apply by root (boundary and deployer policy, 2 in-place updates). This is an IAM change.
3. **B-3:** approval for the **stack** plan and apply that enables it (7 creates, 1 update), and for root to create the SNS email subscription with the owner's address from the private runtime input. The owner then clicks the confirmation link.
4. **B-4:** approval for the read-only simulation and one manual execution (section 11).
5. **Per session (part of Stage D):** creating P and S before `up`, with gate H-20.

## 14. Limitations

- The SDK service slug `elasticloadbalancingv2` for the Step Functions AWS SDK integration is [U]. So are the exact error names used in `Retry` and `Catch`: `SecretsManager.ResourceNotFoundException`, `Rds.InvalidDBInstanceStateException`, `ElasticLoadBalancingV2.LoadBalancerNotFoundException`, and the `ExecutionsFailed` and `ExecutionsTimedOut` metric names. The build PR confirms them against AWS documentation.
- Pricing, billing granularity and Step Functions history retention were not re-verified today.
- Terraform behaviour after an out-of-band ALB delete, and a cleanup racing a running `down` at H, are reasoned, not tested [U].
- The design depends on AWS Scheduler, Step Functions and CloudWatch working, and on Claude arming P and S. Gate H-20 makes a missing or broken mechanism block `up`, and the alarm makes a later failure visible. Neither makes the cost ceiling a guarantee.
