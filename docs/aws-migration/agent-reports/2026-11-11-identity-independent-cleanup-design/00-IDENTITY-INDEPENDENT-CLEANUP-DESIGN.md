# Identity non-production: independent shutdown and cleanup design (Workstream 3)

> **Revision note, 11 Nov 2026 11:18 UTC.** Option 3's timing, sequence and cost below are superseded by
> `01-CLEANUP-IMPLEMENTATION-PROPOSAL.md` revision 2 (sections 1, 3, 9). No design here or there enforces a
> guaranteed cost ceiling.

- Date: 11 Nov 2026, from 10:08 UTC
- Account `229251310592`, region `eu-central-1`, Munaxa Identity non-production (Testing)
- Requested by the owner on 11 Nov 2026 ("Execute Five Parallel Preparation Workstreams",
  Workstream 3, priority Critical).
- Base: `munaxa-platform` `main` `49c51f36fb53d1e450c9cf8af58a969897d00623`.
- **Design only.** Nothing here is implemented. No AWS call that reads or changes account state was
  made for this report; the only AWS tool use was the public AWS documentation search. No
  Terraform, dispatch, IAM, DNS, Cloudflare or secret action was taken. No PR was merged.
- **Every option below needs a separate owner authorization before it is built.** That covers any
  new IAM role, IAM policy, permissions-boundary change, Lambda function, Step Functions state
  machine, EventBridge schedule or target, security group, or any other AWS resource.

Labels: **[V]** verified in the repository or AWS documentation today, **[E]** estimated,
**[U]** unverified, **[R]** recommended, **[O]** owner action or authorization required.

## 1. Problem

Between `up` and a verified `down`, the Identity session leaves the following in the account
(pre-authorization review, PR #89, section G):

| Item | Cost while present [E] | Removed today by |
| --- | --- | --- |
| ALB `munaxa-nonprod` with 2 public IPv4 addresses, listeners 80/443, rules | about US$0.037 an hour | `down` only |
| Service `identity`, 1 Fargate task (Identity and Valkey), 1 public IPv4 | about US$0.033 an hour | `down`; scaled to 0 by the 21:00 backstop |
| Database `munaxa-nonprod-pg` running | about US$0.019 an hour | `down`; stopped by the 21:00 backstop |
| One-off tasks (db-admin, migrate, bootstrap, probe), each with a public IPv4 | under US$0.02 in total if they exit | They exit by themselves; nothing stops a hung one |
| Temporary secret `munaxa-nonprod/identity-bootstrap` (operator email and password) | under US$0.01 | **Only by Claude** (checklist step 16); nothing else |
| Target group, task definitions, logs, certificate | none or negligible | `down` (target group); the rest stay by design |

The existing layers and their gaps [V] (`.github/workflows/aws-session.yml`,
`infra/aws/stack/backstop.tf`, PR #89 section G):

| Layer | Removes | Gap |
| --- | --- | --- |
| L1. Claude's `down` at T0 + 3 h | Everything except the secret, which Claude deletes first | Needs this Claude session and the AWS connector to stay alive and signed in |
| L2. Scheduled `down`, 19:17 and 01:47 UTC | ALB, services, target group; stops the database | GitHub starts scheduled runs late (6 h 40 min observed on 11 Nov, run 42987103535) or drops them. Does not touch secrets |
| L3. EventBridge Scheduler backstop, 21:00 UTC | Stops the database; every service to 0 | **Cannot delete the ALB** (fixed input, the ALB ARN changes every session; Scheduler universal targets cannot call `Describe*`). Does not delete the secret. Up to 5.5 h late for a 15:30 `up` |

So if Claude loses the session or the connector right after `up`, the ALB can run until the next
scheduled `down` that GitHub actually starts, the secret stays until someone deletes it by hand
(residual risk R-1), and the cost reaches about US$1.00 (PR #89, section G). **If both scheduled
`down` runs are dropped, the cost has no fixed upper limit:** the 21:00 backstop cannot delete the
ALB, which keeps costing about US$0.89 a day (about US$27 a month) until someone runs `down`
(PR #95 X-6).

**The US$0.35 ceiling is conditional, not guaranteed.** It holds only when a cleanup that removes
the ALB, the services, the running tasks and the database runs by T0 + 3 h and succeeds, and only
at the rates estimated in the first-session report (not re-priced today). Today the only layer that
does that by T0 + 3 h is L1. No design below makes the ceiling a guarantee: each one moves the
condition from "Claude stays connected" to "an AWS-side or separately controlled mechanism fires
and succeeds". Section 7 states the residual cost in each failure case.

**Implementation proposal, revision 2 (11 Nov 2026, owner corrections at 11:18 UTC):** option 3
is worked out in detail, still as a proposal only, in `01-CLEANUP-IMPLEMENTATION-PROPOSAL.md` in
this folder. **Where they differ, revision 2 supersedes this design:**

- timing: primary run at the hard stop H, a retry at H + 30 min, and a daily run at 21:05 UTC;
- execution: four parallel branches, so the ALB never waits for the database;
- duration: at most 15 min;
- RDS retries: at most 10 min;
- failure alarm by email;
- the cost cases in section 7 below, recalculated in revision 2 section 9.

## 2. Requirements for an independent cleanup

- C-1. Runs without this Claude session and without the AWS connector.
- C-2. Fires by T0 + 3 h, not at a fixed evening time.
- C-3. Deletes the ALB (and so its listeners, rules and IPv4 addresses).
- C-4. Deletes the temporary secret `munaxa-nonprod/identity-bootstrap`, without recovery window.
- C-5. Never deletes the persistent secret `munaxa-nonprod/identity-operator` (Workstream 5,
  Option A), nor anything in production or outside `munaxa-nonprod`.
- C-6. Stops the database, scales services to 0 and stops any task still running in the nonprod
  cluster.
- C-7. Is armed **before** `up`, so there is no window between `up` and arming in which Claude can
  be lost.
- C-8. Is idempotent and harmless when nothing is running (normal early `down`).
- C-9. Its result can be checked without trusting Claude: an AWS-side record that says what was
  deleted and what remains.
- C-10. Leaves Terraform state recoverable: the next `down` or `up` must plan cleanly.

## 3. Facts that constrain the design [V]

- EventBridge Scheduler universal targets call one API with a fixed input, and **do not support
  read-only actions** whose names begin with `get`, `describe`, `list` and similar
  (AWS documentation, "Using universal targets in EventBridge Scheduler", "Unsupported actions").
  A schedule therefore cannot look up the ALB ARN; it must already contain it.
- Scheduler supports one-time schedules with `at(yyyy-mm-ddThh:mm:ss)`; a completed one-time
  schedule still counts against the quota until deleted, and `ActionAfterCompletion` can be set to
  `DELETE` (AWS documentation, "Schedule types in EventBridge Scheduler"; `GetScheduleOutput`).
- Step Functions Standard workflows can call AWS SDK actions directly, including `Describe*`
  (AWS documentation, "Learning to use AWS service SDK integrations in Step Functions"). That
  allows "find the ALB named `munaxa-nonprod`, then delete it" without Lambda code. The exact SDK
  service slug for ELBv2 is to be confirmed at implementation [U].
- The ALB name is fixed: `name = local.prefix`, that is `munaxa-nonprod`
  (`infra/aws/stack/edge.tf:67-79`), with deletion protection off in nonprod.
- `DeleteSecret` takes the secret name as `SecretId` and accepts `ForceDeleteWithoutRecovery`
  (Secrets Manager API reference). An IAM resource pattern
  `secret:munaxa-nonprod/identity-bootstrap-??????` matches only that secret's ARN, never
  `identity-operator`.
- Every new action for a `munaxa-shared` workload role must also be allowed by the permissions
  boundary `munaxa-shared-workload-boundary`, whose `TestingBackstop` statement today allows only
  `rds:StopDBInstance` and `ecs:UpdateService` (`infra/aws/bootstrap/iam.tf:155-165`). Changing it
  is a bootstrap (root) apply.
- The session deployer has `secretsmanager:DescribeSecret` only, no `DeleteSecret`
  (`infra/aws/bootstrap/iam_session.tf:266`). A GitHub-run cleanup of the secret needs an IAM change.
- The account is the Organizations management account. SCPs do not apply to it, so no SCP limits
  or helps here.

## 4. Options

### Option 1. Add the secret to the nightly backstop (fixed input)

One more schedule in `backstop.tf`, universal target `secretsmanager:deleteSecret`, input
`{"SecretId": "munaxa-nonprod/identity-bootstrap", "ForceDeleteWithoutRecovery": true}`, at the
existing 21:00 UTC.

| Aspect | Value |
| --- | --- |
| Resources | 1 schedule; 1 statement in `session_backstop` role policy; 1 action in the boundary |
| Permissions | `secretsmanager:DeleteSecret` on `secret:munaxa-nonprod/identity-bootstrap-??????` |
| Cost [E] | US$0.00 (inside the Scheduler free tier) |
| Failure behaviour | Nightly `ResourceNotFoundException` when no secret exists (harmless, counted as a target error in metrics, as the service schedules are today). If the schedule or role is broken, the secret stays |
| Deletes the ALB | **No** |
| Removes the secret | Yes, but only at 21:00, up to 5.5 h after a 15:30 `up` |
| Independent verification | CloudTrail `DeleteSecret` by the backstop role; `ListSecrets` count 0 on the next check |

Meets C-1, C-4, C-5, C-8. Fails C-2, C-3, C-7 (it is always armed, but late).

### Option 2. Per-session one-shot Scheduler actions with the live ALB ARN

After `up`, Claude creates one-time schedules `at(T0 + 3 h)` with `ActionAfterCompletion = DELETE`:
`elasticloadbalancingv2:deleteLoadBalancer` with the ARN read after `up`;
`secretsmanager:deleteSecret`; `rds:stopDBInstance`; `ecs:updateService` desired count 0.

| Aspect | Value |
| --- | --- |
| Resources | 4 one-time schedules per session (created by root through the connector, each a separate AWS change); 1 persistent role or an extended `session_backstop` role |
| Permissions | Scheduler role: `elasticloadbalancing:DeleteLoadBalancer` on `loadbalancer/app/munaxa-nonprod/*`, `secretsmanager:DeleteSecret` as option 1, the two existing actions; boundary extended to match. Creator: `scheduler:CreateSchedule` and `iam:PassRole` (root has both) |
| Cost [E] | US$0.00 |
| Failure behaviour | **The ALB schedule can only be created after `up`**, so a loss of Claude between `up` and arming leaves no ALB cleanup (fails C-7). Each schedule is independent: one failing does not stop the others. No step stops a hung one-off task. If the ALB ARN is wrong, Scheduler accepts it at creation and fails at run time |
| Deletes the ALB | Yes, if armed |
| Removes the secret | Yes |
| Independent verification | CloudTrail per call; Scheduler target-error metrics; no single record that says "all clean" |

### Option 3. Time-limited AWS-native cleanup state machine, armed before `up` **[R]**

A persistent Step Functions Standard state machine, `munaxa-nonprod-session-cleanup`, defined in
Terraform next to `backstop.tf` (nonprod only), that finds and removes everything by fixed names and
then checks the result. Per session it is armed by **one** one-time schedule created **before**
`up`:

- 3a **[R]**: Claude creates schedule `munaxa-nonprod-session-cleanup-<T0>` with
  `at(T0 + 3 h)`, `ActionAfterCompletion = DELETE`, flexible window off, target the state machine
  (templated `StartExecution`), retry 3 within 1 h. `up` is dispatched only after `GetSchedule`
  shows it ENABLED with the right time.
- 3b: Claude starts an execution whose first state is `Wait` until `T0 + 3 h`. Fewer resources, but
  an execution waiting for 3 h is less visible than a named schedule, and cancelling it means
  `StopExecution`.

State machine outline (design, not code):

1. `DeleteBootstrapSecret`: `DeleteSecret` `munaxa-nonprod/identity-bootstrap`,
   `ForceDeleteWithoutRecovery`; catch `ResourceNotFoundException` as done. First, because it is the
   most sensitive item.
2. `ScaleIn`: `UpdateService` desired count 0 for `identity` (and the other backstop service names,
   each catching `ServiceNotFoundException`).
3. `StopTasks`: `ListTasks` in cluster `munaxa-nonprod`, then `StopTask` for each (catches a hung
   one-off task and its public IPv4).
4. `DeleteAlb`: `DescribeLoadBalancers` `Names=["munaxa-nonprod"]`, then `DeleteLoadBalancer` on the
   returned ARN; catch `LoadBalancerNotFound` as done.
5. `StopDatabase`: `StopDBInstance` `munaxa-nonprod-pg`; on `InvalidDBInstanceState`, retry every
   5 min for up to 1 h (a database still `starting` cannot be stopped); `stopped` or `stopping`
   counts as done.
6. `Verify`: `DescribeLoadBalancers` (expect not found), `DescribeSecret` (expect not found),
   `ListTasks` (expect 0), `DescribeDBInstances` (expect `stopping` or `stopped`). Any remainder
   ends the execution in **FAILED** with a state output naming what remains (names only, never a
   value).

| Aspect | Value |
| --- | --- |
| Resources (persistent, Terraform) | 1 state machine; 1 execution role for Step Functions; 1 role for Scheduler (or the `session_backstop` role extended with `states:StartExecution`); boundary statement extended. No Lambda, no log group (execution history is kept by Step Functions), no security group, no network access |
| Resources (per session, root via connector) | 1 one-time schedule, self-deleting after it fires |
| Permissions, Step Functions role | `secretsmanager:DeleteSecret` and `secretsmanager:DescribeSecret` on `secret:munaxa-nonprod/identity-bootstrap-??????`; `ecs:UpdateService`, `ecs:ListTasks`, `ecs:StopTask` with condition `ecs:cluster` = the nonprod cluster ARN; `elasticloadbalancing:DescribeLoadBalancers` on `*` (the action supports no resource scoping); `elasticloadbalancing:DeleteLoadBalancer` on `loadbalancer/app/munaxa-nonprod/*`; `rds:StopDBInstance` and `rds:DescribeDBInstances` on `db:munaxa-nonprod-pg`. Nothing for production, no IAM, no write outside these names. A condition on `secretsmanager:ForceDeleteWithoutRecovery` can be added if the key exists [U] |
| Permissions, Scheduler role | `states:StartExecution` on the one state machine ARN; trust `scheduler.amazonaws.com` with `aws:SourceAccount` |
| Permissions, arming | `scheduler:CreateSchedule`, `scheduler:GetSchedule`, `scheduler:DeleteSchedule`, `iam:PassRole` for the Scheduler role. Root has them; no session-deployer change |
| Cost [E] | About 15 to 25 state transitions per run, a few runs a month: inside the Step Functions Standard free tier of 4,000 transitions a month, or about US$0.0006 a run at US$0.025 per 1,000 if the free tier does not apply. Scheduler free. Rates not re-verified today [U] |
| Failure behaviour | If the schedule is not created, `up` is not dispatched (gate). If the schedule fires late, Scheduler retries for up to 1 h. If one step fails, later steps still run (each step catches and records) and `Verify` fails the execution. If AWS Scheduler or Step Functions has an outage, L2 and L3 remain. If the role is mis-scoped, the dry run (section 6) shows it before the first session. Firing on an already clean account does nothing and ends SUCCEEDED (C-8) |
| Deletes the ALB | **Yes** (lookup by fixed name, so it can be armed before the ALB exists) |
| Removes the secret | **Yes**, and only that secret (C-5 by resource pattern) |
| Independent verification | See section 5 |

Meets C-1 to C-10. Recommended because it is the only option that is armed before `up`, deletes the
ALB and the secret, and leaves one record that says whether the account is clean.

### Option 4. Lambda dead-man switch (recurring)

A Lambda function on a `rate(15 minutes)` schedule reads a session expiry (an SSM parameter or a tag
written before `up`) and, once it is past, does the same steps as option 3.

| Aspect | Value |
| --- | --- |
| Resources | Lambda function and its code, its role, its log group, 1 recurring schedule, the expiry parameter |
| Permissions | As option 3 for the function role, plus `ssm:GetParameter` and `logs:*` for its own group |
| Cost [E] | About 2,900 invocations a month, inside the Lambda free tier; log storage cents a month |
| Failure behaviour | A code defect or a bad expiry value can delete a live session early or never fire; Lambda runtime deprecations need upkeep. Fires within 15 min of expiry |
| Deletes the ALB | Yes |
| Removes the secret | Yes |
| Independent verification | Function logs, CloudTrail; no built-in "all clean" status unless coded |

Same coverage as option 3, more moving parts and custom code to review. Not recommended.

### Option 5. Separately controlled cleanup workflow (GitHub)

A new `workflow_dispatch` workflow, `aws-session-cleanup.yml`, that deletes the secret and then
runs the existing `down`. It is not started by cron (cron is the late path) but by one of:
the owner tapping **Run workflow** in the GitHub app; or a separate scheduled Claude routine,
created before `up`, that dispatches it at T0 + 3 h.

| Aspect | Value |
| --- | --- |
| Resources | 1 workflow file; an IAM change to the session deployer (`secretsmanager:DeleteSecret` on the bootstrap secret pattern) and the matching boundary statement; optionally 1 Claude routine |
| Permissions | GitHub OIDC CI role and session deployer as today, plus the one secret action |
| Cost | US$0.00 in AWS; GitHub-hosted minutes |
| Failure behaviour | `workflow_dispatch` usually starts within minutes, unlike cron, but still depends on GitHub Actions and the OIDC roles being healthy. The routine variant depends on Claude's scheduler, which is independent of this session but not of Claude. The owner variant depends on the owner being reachable, which the owner direction of 11 Nov asks to avoid for technical steps |
| Deletes the ALB | Yes (through `down`) |
| Removes the secret | Yes |
| Independent verification | The run log and summary (public repository: names and counts only); CloudTrail |

Useful as a second, human-reachable layer; not independent of GitHub.

### Rejected

- **AWS Budgets actions**: can attach an IAM policy or SCP or stop EC2/RDS instances, cannot delete
  an ALB or a secret, and react to billing data that lags by hours.
- **CloudWatch alarm actions**: limited to SNS, Auto Scaling and EC2 actions; none deletes an ALB.
- **RDS or ECS built-in timeouts**: none exists for a running service or ALB.

## 5. How a cleanup is verified independently (option 3)

1. **Step Functions execution history** for `munaxa-nonprod-session-cleanup`: status SUCCEEDED or
   FAILED, and the `Verify` output listing what remains (names and counts only). Kept by the
   service for 90 days [U on retention period], readable in the console by the owner without
   Claude.
2. **CloudTrail Event history**: `DeleteSecret`, `DeleteLoadBalancer`, `StopTask`,
   `UpdateService`, `StopDBInstance` with the state machine role's session as the caller, each with
   its error code or none.
3. **Scheduler**: the one-time schedule is gone after it fires (`ActionAfterCompletion = DELETE`);
   CloudTrail shows its invocation of `StartExecution`.
4. **The next read-only check** (preflight P-6 and the shutdown check of checklist step 18):
   0 ALB, 0 services running, 0 tasks, DB stopped, bootstrap secret count 0.
5. **Lagging signal**: the existing US$50 budget alerts (`infra/aws/bootstrap/budget.tf`).
6. Optional, not recommended now: an SNS topic with the owner's email subscribed, notified on
   FAILED. That is one more resource and an owner confirmation click.

A normal session leaves the schedule in place after its own `down`, so it fires at T0 + 3 h on a
clean account and ends SUCCEEDED. That run is itself independent proof that the account was clean
at the hard stop.

## 6. Proving the design before the first session

- `SimulatePrincipalPolicy` on both new roles with the boundary, for each action and resource above,
  and a deny check for `munaxa-nonprod/identity-operator`, a prod ARN and an ALB of another name.
- One dry run of the state machine with nothing running (all not-found paths), started by root,
  expected SUCCEEDED. This does not prove the delete paths; the first real proof is the first
  session's run, which section 5 records.
- `terraform test` cases for the state machine definition and the role policies, as
  `infra/aws/stack/tests` does for `backstop.tf`.

## 7. Cost and the US$0.35 ceiling under each failure case [E]

> Superseded by revision 2, section 9 (`01-CLEANUP-IMPLEMENTATION-PROPOSAL.md`), which recalculates these
> cases from the actual cleanup timing. The table below is kept as written for the record.

Rates from PR #89 section G (about US$0.09 to 0.10 an hour while running; not re-priced today).
ALB and IPv4 charges are per hour or partial hour [U], so a cleanup at 3 h 05 min may bill a fourth
hour; firing at T0 + 2 h 55 min avoids that.

| Case | Approximate session cost |
| --- | --- |
| L1 `down` on time | about US$0.20 to 0.30 |
| Claude lost after `up`; option 3 fires and succeeds at T0 + 3 h | about US$0.30 to 0.33; ceiling holds |
| Claude lost; option 3 fires, the DB stop retries for 1 h | up to about US$0.35 |
| Claude lost; option 3 does not fire or fails at the ALB | falls back to L2/L3: about US$1.00 if a scheduled `down` runs; **no fixed upper limit** (ALB about US$0.89 a day) if both are dropped |
| Claude lost; options 1 to 5 not built (today) | about US$1.00 if a scheduled `down` runs, **no fixed upper limit** if both are dropped; the secret remains (R-1) |

The persistent secret `munaxa-nonprod/identity-operator` (Workstream 5) adds about US$0.40 a month,
outside the per-session ceiling [E, U].

## 8. Effects on Terraform state and other workstreams

- Deleting the ALB outside Terraform leaves it, its listeners and rules in state. The next `down`
  refreshes, finds them gone and deletes only the target group and services; the next `up` creates
  them again. Both stay inside the session plan check's allowed types. A test session should confirm
  this once [U].
- Scaling a service to 0 shows as desired-count drift in the next plan, as with L3 today.
- If cleanup fires while a `down` is applying, the provider's delete of an already deleted ALB is
  expected to treat not-found as done [U].
- Workstream 2's probe task reads the operator password from the temporary bootstrap secret, so that
  secret must live until the probe ends. Option 3 deletes it at T0 + 3 h at the latest; L1 deletes it
  earlier (checklist step 16).

## 9. What the owner would authorize to build option 3 [O]

None of this is authorized today.

1. A Terraform change in `infra/aws/stack/` (state machine, two roles or one extended role, policies)
   and a test, through a PR.
2. A bootstrap change to `munaxa-shared-workload-boundary` (`TestingBackstop` statement) for the
   new actions, applied by root.
3. A stack apply that creates those resources.
4. Per session, as part of the session authorization: creating the one-time schedule before `up`,
   and the rule that `up` is not dispatched until it is confirmed ENABLED.
5. The simulation and dry run of section 6.

## 10. Limitations

- Pricing and the Step Functions history retention period were not re-verified today.
- The exact SDK service slug for ELBv2 in Step Functions and the
  `secretsmanager:ForceDeleteWithoutRecovery` condition key are not confirmed.
- Behaviour of Terraform after an out-of-band ALB delete is reasoned, not tested.
- No design removes the dependency on AWS itself; an AWS Scheduler or Step Functions outage falls
  back to L2 and L3.
