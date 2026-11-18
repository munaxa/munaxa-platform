# 06. D-B4: idle cleanup dry run

**Status: PREPARED, OWNER ACTION REQUIRED, NOT RUN.** No execution was started. The real cleanup
was not run either. The daily schedule R and the backstop were not touched.

## 1. Why a dry run cannot change anything

The safety rests on two independent layers. Both were checked in code for this task. Neither has
been observed live yet.

1. **The state machine itself** (`infra/aws/stack/session-cleanup/definition.asl.json`, applied by D-B3):
   - The first state, `CheckInput`, sends anything but a boolean `dryRun` to `BadInput` (Fail, "Nothing was changed").
   - Each of the five write tasks (`deleteSecret`, `deleteLoadBalancer`, `updateService`, `stopTask`, `stopDBInstance`) is reached only from a Choice that sends `dryRun == true` to a `Would…` pass state instead.
   - A graph check of the rendered definition, done in this task, confirmed this. Each write task has exactly one predecessor, and that predecessor is its guard Choice, whose `dryRun == true` rule comes before the write rule:

     | Guard Choice | Write task | `dryRun == true` goes to |
     | --- | --- | --- |
     | `SecretVerify` | `SecretDelete` | `SecretWouldDelete` |
     | `AlbCheck` | `AlbDelete` | `AlbWouldDelete` |
     | `ServiceCheck` | `ServiceScale` | `ServiceWouldScale` |
     | `TaskDry` | `TaskStopOne` | `TaskWouldStop` |
     | `DbCheck` | `DbStop` | `DbWouldStop` |
   - The offline ASL simulator (`test_session_cleanup.py`, 49 tests) runs the reviewed definition. `test_dry_run_with_everything_left_changes_nothing` runs it with a full session left behind (secret, ALB, services, tasks, database available). It asserts **zero mutating calls** and an unchanged world, with the statuses `would-delete`, `would-scale-to-0` and `would-stop`. `test_nothing_left_succeeds_and_changes_nothing` covers the idle path.
2. **Idle means there is nothing to act on.** The precheck refuses unless:
   - no ECS service or task exists;
   - no load balancer named `munaxa-nonprod` exists;
   - the database is already `stopped`.

   So even a definition that ignored `dryRun` would find nothing to delete, scale or stop. The one
   exception is a bootstrap secret, and that does not exist before Stage E or C-8G.

Afterwards, a third check reads the execution history. It confirms that no write operation was
even scheduled.

## 2. Script

The script is `supporting/d-b4-dry-run-idle.py`, with SHA-256 `49194a63…2dfc` in this commit. It
follows the sandbox rules and uses the shared helpers verbatim.

### `precheck` (read-only)

PASS only if all of these hold:

| Check | Requirement |
| --- | --- |
| Account | 229251310592 |
| State machine | `arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup` is `ACTIVE`, `STANDARD`, and the live definition still starts with the reviewed `CheckInput` → `BadInput` structure |
| Executions | none `RUNNING` |
| ECS cluster `munaxa-nonprod` | 0 services and 0 tasks, with no further page |
| Load balancer | `DescribeLoadBalancers(Names=[munaxa-nonprod])` returns `LoadBalancerNotFound` |
| RDS `munaxa-nonprod-pg` | `stopped` |
| Time | outside 20:40–21:30 UTC, so the run never overlaps the 21:00 backstop or R at 21:05 |

It also returns the definition's `revisionId` and length. Before asking for the start, Claude
compares the live definition with the template rendered from `main`. That comparison is a
read-only step outside the sandbox.

### `start`

- It runs the precheck again.
- It makes exactly one `states:StartExecution` call, with name `dry-run-idle-<UTC yyyymmddThhmm>` and input exactly `{"dryRun":true}`.
- That constant is the only execution input in the script, and a test checks this.
- The name is unique per minute, so Step Functions refuses or deduplicates a retry.
- It polls `DescribeExecution` for up to 40 seconds.

### `status` (read-only, for the returned ARN)

- It refuses any ARN that is not a `dry-run-idle-` execution of this state machine.
- It returns the status, start and stop times, the input check and each branch status.
- It reads every `TaskScheduled` event from `GetExecutionHistory` with `includeExecutionData=false`.

PASS only if all of these hold:

- the execution is SUCCEEDED;
- the input and the output both say `dryRun` true;
- the branches are exactly secret `absent`, alb `absent`, ecs `done`, database `stopped`;
- **no write operation was scheduled**.

**The script never** runs `{"dryRun": false}`, `StopExecution`, any schedule or alarm change, or
any secret read.

**Offline tests:** 7 D-B4 tests against a fake AWS that holds the real rendered definition. All
pass (file 09). They cover:

- every unsafe precheck state refuses the start (running execution, service, task, ALB, available database, altered definition);
- the backstop window is refused;
- the start is one dry-run execution;
- a scheduled write or an unexpected branch status fails;
- a foreign execution ARN is refused.

## 3. Procedure

1. **Owner yes/no (D-B4 idle dry run).** It is best done after the D-B2R apply, so that a working scheduled `down` is in place, but it does not depend on it.
2. **Claude runs `precheck`** and compares the live definition with the rendered template. Any FAIL or difference: stop and report.
3. **Claude runs `start`.** It records the execution ARN, the start and stop times and the result.
4. **Claude runs `status`.** This is the read-only post-execution check.
5. **Claude runs a read-only after-check:** the same ECS, ALB and RDS reads as the precheck. Nothing may differ.

## 4. What the dry run does and does not prove

- **It proves** that the state machine runs end to end in AWS with the live role. It also proves
  that the read permissions work (`ListSecrets`, `DescribeLoadBalancers`, `DescribeServices`,
  `ListTasks`, `DescribeDBInstances`).
- **It does not prove** the delete, scale or stop permissions. Only a real run with something to
  act on can show those.
- **It does not satisfy H-20.** The gate needs a real (`dryRun false`) success within 26 h
  (file 07).
- **One extra effect:** a SUCCEEDED dry run counts as `ExecutionsSucceeded`, so it can clear the
  `not-run` alarm. This is expected, and it is why H-20 checks the input of the last success
  separately.
- **Timing interaction with H-20.** The H-20 gate reads only the **latest** SUCCEEDED execution
  and requires it to be a real run. A dry run started after R makes the gate fail until the next R
  has succeeded, which is fail-closed. So the dry run should run before R on the day it is
  done: before 20:40 UTC, which the script enforces from the other side. Then R at 21:05 becomes
  the latest success.
