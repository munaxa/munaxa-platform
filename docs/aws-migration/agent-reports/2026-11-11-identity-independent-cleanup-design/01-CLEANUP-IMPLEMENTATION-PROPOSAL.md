# Independent session cleanup: implementation proposal for option 3 (11 Nov 2026)

- Requested by the owner at 10:30 UTC, 11 Nov 2026 ("Fast-Track Final Preparation and Approval Package", section 4).
- This proposal extends `00-IDENTITY-INDEPENDENT-CLEANUP-DESIGN.md` (option 3, recommended).
- Account `229251310592`, region `eu-central-1`. Base: `main` `49c51f3`.
- **Proposal only. Nothing is implemented.** No Terraform file, IAM statement, state machine, schedule or other AWS resource was added or changed. No AWS call was made for this document.
- **The owner's rule:** the first testing session should not run with an unbounded ALB cost risk. With this proposal built, the cost case "Claude lost and both scheduled `down` runs dropped" becomes bounded at about US$0.35. Without it, that case has no fixed upper limit (about US$0.89 a day for the ALB; PR #95 X-6).

Labels:

- **[V]** verified in the repository today;
- **[U]** unverified, to be checked in the build PR;
- **[O]** owner authorization required.

## 1. Architecture

```
before `up` (Claude, root via connector)            at T0 + 2 h 55 min (AWS only)
-------------------------------------------         ------------------------------------------------
CreateSchedule  munaxa-nonprod-cleanup-<T0>   --->  EventBridge Scheduler (one-time, at(...),
  at(T0 + 2h55m), ActionAfterCompletion=DELETE        flexible window OFF, retry 3, max age 1 h)
  target = state machine, role = session_backstop             |
GetSchedule -> State ENABLED  (gate for `up`)                 | states:StartExecution
                                                              v
                                          Step Functions Standard  munaxa-nonprod-session-cleanup
                                          role munaxa-nonprod-session-cleanup (boundary as today)
                                            1 DeleteBootstrapSecret   (Secrets Manager, exact name)
                                            2 ScaleIn                 (ECS UpdateService x services)
                                            3 StopTasks               (ECS ListTasks + StopTask)
                                            4 DeleteAlb               (ELBv2 Describe by name + Delete)
                                            5 StopDatabase            (RDS, retry while not stoppable)
                                            6 Verify                  (4 reads; FAILED if anything left)
```

The design has no Lambda, no custom code, no network access, no log group and no new security group.

Every step calls the AWS SDK through Step Functions' service integrations (`arn:aws:states:::aws-sdk:<service>:<action>`).

## 2. Execution sequence

| # | State | Calls | Done when | On error |
| --- | --- | --- | --- | --- |
| 1 | `DeleteBootstrapSecret` | `secretsmanager:DescribeSecret` `SecretId = munaxa-nonprod/identity-bootstrap`. If `Name` equals that exact string, `DeleteSecret` on the returned **ARN** with `ForceDeleteWithoutRecovery = true` | Deleted, or `ResourceNotFoundException` (already absent) | Retry 3 times (backoff 2, interval 5 s). Then `Catch`: record `secret` in `$.errors`, continue to 2 |
| 2 | `ScaleIn` | `Map` over the 10 backstop service names (as `backstop.tf`): `ecs:UpdateService` `Cluster = munaxa-nonprod`, `DesiredCount = 0` | Updated, or `ServiceNotFoundException` / `ServiceNotActiveException` | Retry 3 times. Then `Catch` per item, continue |
| 3 | `StopTasks` | `ecs:ListTasks` `Cluster = munaxa-nonprod` (all, paginated by a `Choice` loop on `NextToken`), then `Map` `ecs:StopTask` `Reason = session-cleanup` | List empty after stop | Retry 3 times. Then `Catch`, continue |
| 4 | `DeleteAlb` | `elasticloadbalancingv2:DescribeLoadBalancers` `Names = ["munaxa-nonprod"]`; if exactly one result with `LoadBalancerName = munaxa-nonprod` and `Scheme = internet-facing`, `DeleteLoadBalancer` on its ARN | Deleted, or `LoadBalancerNotFoundException` | Retry 3 times (interval 10 s). Then `Catch`, continue |
| 5 | `StopDatabase` | `rds:StopDBInstance` `munaxa-nonprod-pg` | Accepted, or `InvalidDBInstanceState` with status `stopped` or `stopping` (checked by `DescribeDBInstances`) | On `InvalidDBInstanceState` while `starting`, `backing-up` or `modifying`: `Wait` 300 s and retry, at most 12 times (1 h). Then `Catch`, continue |
| 6 | `Verify` | `DescribeSecret` (expect not found), `DescribeLoadBalancers` by name (expect not found), `ListTasks` (expect 0), `DescribeServices` (expect desired 0 for all services that exist), `DescribeDBInstances` (expect `stopping` or `stopped`) | All five as expected | Anything left ends the execution in `Fail` with `Error = CleanupIncomplete` and `Cause` = the names of what remains. Never a value |

**Timeouts.**

- The state machine has `TimeoutSeconds = 5400` (90 min, covering the 1 h database retry).
- Each SDK task has `TimeoutSeconds = 60`.
- Scheduler retries the start up to 3 times within 1 h (`MaximumEventAgeInSeconds = 3600`).

**Idempotence.** Firing on a clean account (after Claude's normal `down`) finds nothing in every step, then ends `SUCCEEDED`. That run is itself proof that the account was clean at the hard stop.

**What it never touches:**

- `munaxa-nonprod/identity-operator`, which an explicit `Deny` covers (section 3);
- production (`munaxa-prod-*`);
- task definitions, logs, the certificate, the VPC and Terraform state.

## 3. IAM: roles, trust and permissions

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

**Role 2 (existing, extended): `munaxa-nonprod-session-backstop`.** Its trust is already `scheduler.amazonaws.com` with `aws:SourceAccount` [V, `backstop.tf`]. One statement is added:

```json
{
  "Sid": "StartTheCleanup",
  "Effect": "Allow",
  "Action": "states:StartExecution",
  "Resource": "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup"
}
```

No new Scheduler role is created.

**The boundary (bootstrap, root apply).** The `TestingBackstop` statement in `infra/aws/bootstrap/iam.tf` (lines 157-165) [V] today allows only `rds:StopDBInstance` and `ecs:UpdateService`. It is extended with:

- the actions above, on the same nonprod-only resources;
- `states:StartExecution` on `stateMachine:munaxa-nonprod-*`.

A boundary is a ceiling, not a grant.

**The deployer (bootstrap, root apply).** The deployer that applies `infra/aws/stack` has no `states:` permission today, and `PassOwnRoles` lists only `ecs-tasks`, `ecs` and `scheduler` as `iam:PassedToService` [V, `iam_allow.tf` lines 261, 397-405]. Two changes are needed:

- add `states:CreateStateMachine`, `UpdateStateMachine`, `DeleteStateMachine`, `DescribeStateMachine`, `TagResource`, `ListTagsForResource`, `ListStateMachineVersions` on `stateMachine:munaxa-nonprod-*`;
- add `states.amazonaws.com` to `PassOwnRoles`.

The session deployer (`iam_session.tf`) does **not** change. The state machine is a configuration resource, not a session resource.

**Arming permissions.** Root, through the connector, needs `scheduler:CreateSchedule`, `GetSchedule`, `DeleteSchedule` and `iam:PassRole` (for role 2). Root already has them. No IAM user, access key or Identity Center change is involved.

## 4. Arming before `up`, and the gate

This is one connector call by Claude, after the Stage D authorization, before `aws-session.yml up` is dispatched:

```python
T0 = <UTC time Claude will dispatch up>                       # recorded in the session log
AT = (T0 + timedelta(hours=2, minutes=55)).strftime("%Y-%m-%dT%H:%M:%S")
params = {
  "Name": f"munaxa-nonprod-cleanup-{T0:%Y%m%dT%H%MZ}",
  "ScheduleExpression": f"at({AT})", "ScheduleExpressionTimezone": "UTC",
  "FlexibleTimeWindow": {"Mode": "OFF"},
  "ActionAfterCompletion": "DELETE",
  "Target": {
    "Arn": "arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup",
    "RoleArn": "arn:aws:iam::229251310592:role/munaxa-shared/munaxa-nonprod-session-backstop",
    "Input": "{\"session\": \"<T0>\"}",
    "RetryPolicy": {"MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 3600},
  },
}
# CreateSchedule, then GetSchedule: State == "ENABLED", Target.Arn and ScheduleExpression exact.
```

**The gate.** `up` is not dispatched unless the schedule's `GetSchedule` returns `ENABLED` with the exact target and time. This is a hard stop in the runbook (new H-20).

Two further rules:

- The schedule fires at T0 + 2 h 55 min. That is 5 min before Claude's own hard stop, so a partial fourth hour is not billed [U on billing granularity].
- If Claude's own `down` finishes early, the schedule is left in place. It fires on a clean account and records `SUCCEEDED`.

## 5. How each target is identified

- **Bootstrap secret:** `DescribeSecret` by the exact name, then a name equality check, then the delete by ARN. The `Allow` resource pattern matches only that name plus the 6-character suffix. An explicit `Deny` covers the persistent secret.
- **ECS services:** the fixed list of 10 nonprod service names already used by `backstop.tf`, in cluster `munaxa-nonprod`. The `ecs:cluster` condition limits the role to that cluster.
- **ECS tasks:** every task in cluster `munaxa-nonprod`. That catches a hung one-off task (db-admin, migrate, bootstrap, probe) and its public IPv4.
- **ALB:** found by name, `munaxa-nonprod`, because the ALB ARN changes every session. That is why the existing backstop cannot delete it. The name check and the resource ARN pattern `loadbalancer/app/munaxa-nonprod/*` together exclude every other load balancer.
- **RDS:** the fixed identifier `munaxa-nonprod-pg`.

## 6. Independent verification

These checks are readable by the owner in the console and by the next Claude session, without the session that armed the schedule:

1. **Step Functions execution history:** `SUCCEEDED`, or `FAILED` with `CleanupIncomplete` naming what remains. Each step's output records `deleted`, `absent` or the error code.
2. **CloudTrail:** `DeleteSecret`, `UpdateService`, `StopTask`, `DeleteLoadBalancer` and `StopDBInstance` called by `munaxa-nonprod-session-cleanup`, with error codes. Scheduler's `StartExecution` called by `munaxa-nonprod-session-backstop`.
3. **Scheduler:** the one-time schedule is gone after it fires (`ActionAfterCompletion = DELETE`).
4. **The next read-only preflight:** 0 ALB, 0 running tasks, all services at desired 0, database stopped, bootstrap secret count 0 (`IncludePlannedDeletion`), persistent secret present.
5. **The budget alert (US$50)** remains as a lagging signal.

## 7. Failure handling

| Failure | Effect | Fallback |
| --- | --- | --- |
| Schedule not created or not `ENABLED` | `up` is not dispatched (gate) | None needed |
| Scheduler fires late | Retries for up to 1 h | L2 scheduled `down`, L3 21:00 backstop |
| One step fails after retries | Later steps still run (each `Catch` continues) | `Verify` fails the execution; the owner sees `FAILED`; the next session's preflight finds the remainder |
| ALB delete fails | ALB keeps billing | L2 scheduled `down`; worst case returns to the unbounded case for that session only, visible as `FAILED` |
| Role mis-scoped | `AccessDenied` in the step output | Caught before the first session by section 8 |
| Step Functions or Scheduler regional outage | Nothing fires | L2 and L3 as today |
| Fires while a `down` is applying | Terraform finds the ALB already gone; not-found treated as deleted [U] | Next `down` or `up` reconciles |

**Terraform drift.** Deleting the ALB outside Terraform leaves it in state. The next `down` refreshes, sees it gone and removes the rest; the next `up` recreates it. Both stay inside the session plan check's allowed types. To be confirmed once in the build PR's test session [U].

## 8. Proving it before the first session

- `terraform test` cases with the mocked provider:
  - the state machine definition contains exactly the six states, and the delete targets are the fixed names;
  - the role policy holds only the statements in section 3;
  - the `Deny` on the persistent secret is present.
- After the Stage B apply, two read-only checks:
  - `SimulatePrincipalPolicy` on both roles with the boundary, for every allowed action and resource;
  - an expected-deny check for `munaxa-nonprod/identity-operator`, a `munaxa-prod` ARN and an ALB of another name.
- One dry run, started by root with nothing running. Every step takes its not-found path, and the run is expected to end `SUCCEEDED`. This does not prove the delete paths. The first session's own fire at T0 + 2 h 55 min, on an already clean account, is the second proof. The delete paths are proven only if Claude is actually lost.

## 9. Cost

Estimates, not re-priced today [U]:

| Item | Cost |
| --- | --- |
| State machine and roles, idle | US$0.00 |
| One execution | about 20 to 40 state transitions. Inside the Standard free tier of 4,000 a month; otherwise about US$0.001 |
| One-time schedule | inside the Scheduler free tier (14 million invocations a month) |
| SDK calls | Secrets Manager about US$0.000005 a call; the others are free |
| **Total per session** | **under US$0.01** |

The effect on the session cost model:

- **Claude lost after `up`:** the cleanup fires at T0 + 2 h 55 min, and the session costs about US$0.30 to 0.35.
- **Claude lost and the cleanup also fails:** the session falls back to L2 and L3, about US$1.00, or unbounded only if both scheduled `down` runs are also dropped. It is visible as `FAILED`.

## 10. Terraform changes (one build PR, after Stage B)

| Root | Address | Change |
| --- | --- | --- |
| `infra/aws/stack` | `aws_sfn_state_machine.session_cleanup[0]` | create (Standard, `munaxa-nonprod-session-cleanup`, definition from `templatefile` with fixed names) |
| `infra/aws/stack` | `aws_iam_role.session_cleanup[0]` | create (trust `states.amazonaws.com`, boundary as today) |
| `infra/aws/stack` | `aws_iam_role_policy.session_cleanup[0]` | create (section 3, role 1) |
| `infra/aws/stack` | `aws_iam_role_policy.session_backstop[0]` | update in place (adds `StartTheCleanup`) |
| `infra/aws/bootstrap` | boundary `munaxa-shared-workload-boundary` (nonprod) | update in place (`TestingBackstop` statement extended) |
| `infra/aws/bootstrap` | deployer policy (nonprod) | update in place (`states:*` on own state machines; `PassOwnRoles` adds `states.amazonaws.com`) |

- **Gating.** All stack resources sit behind a new variable, `session_cleanup_enabled` (default `false`), so merging the PR changes no plan. Enabling it is a configuration PR with its own apply, as for the probe.
- **Expected changes for the stack apply:** 3 creates and 1 update. For the bootstrap apply: 2 updates, applied by root.
- **Order.** The bootstrap apply comes first, because the deployer needs `states:` before the stack apply.

## 11. Owner approvals required (Stage B, separate from A, C and D)

None of these is given today.

1. **B-1:** approval to open and merge the build PR (Terraform, tests, runbook H-20 gate). This is a code merge.
2. **B-2:** approval for the **bootstrap** apply by root (boundary and deployer policy, 2 in-place updates). This is an IAM change.
3. **B-3:** approval for the **stack** plan and apply that enables it (3 creates, 1 update). These are IAM and Step Functions resources.
4. **B-4:** approval for the read-only simulation and the one dry run of section 8.
5. **Per session (part of Stage D):** creating the one-time schedule before `up`, with the H-20 gate.

## 12. Limitations

- The SDK service slug `elasticloadbalancingv2` for Step Functions' AWS SDK integration is [U]. The build PR confirms it against AWS documentation.
- The exact retry error names are [U]: `SecretsManager.ResourceNotFoundException`, `Rds.InvalidDBInstanceStateException`, `ElasticLoadBalancingV2.LoadBalancerNotFoundException`.
- Pricing, Step Functions history retention and ALB billing granularity were not re-verified today.
- Terraform behaviour after an out-of-band ALB delete is reasoned, not tested.
- This does not remove the dependency on AWS itself, or on Claude arming the schedule correctly before `up`. The gate makes a missing schedule block `up` instead of failing silently.
