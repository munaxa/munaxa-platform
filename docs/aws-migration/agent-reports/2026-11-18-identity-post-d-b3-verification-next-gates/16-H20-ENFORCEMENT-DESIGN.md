# 16. Design proposal: enforce H-20 before every Testing `up`

**Status: PROPOSAL ONLY. Not implemented.** It needs a separate owner approval for the code PR and
another for its bootstrap apply. H-20 itself is unchanged.

## 1. Problem

H-20 today is the connector script `scripts/aws/connector/h20-session-cleanup-gate-and-arm.py` in
mode `gate`, which an operator runs by hand before an `up` (file 07). The `up` path in
`.github/workflows/aws-session.yml` (job `session`) has no gate step. A `workflow_dispatch` with
`session: up` would plan, start the database and apply the switches whatever the cleanup's state.

## 2. Proposed change (code PR "H-20E")

1. **New script `scripts/aws/session-cleanup-gate.sh`** (bash + AWS CLI + `jq`, the tools the job
   already has). It evaluates the same seven conditions as `gate`, and fails closed:
   - state machine `munaxa-nonprod-session-cleanup` exists and is `ACTIVE`/`STANDARD`;
   - its latest `SUCCEEDED` execution stopped within 26 h, and its input is exactly `{"dryRun":false}`;
   - no execution is `RUNNING`;
   - schedule `munaxa-nonprod-session-cleanup-daily` is `ENABLED`, targets that state machine, and has input `{"dryRun":false}`;
   - alarms `-failed` and `-not-run` both exist, and neither is in `ALARM`;
   - no `munaxa-nonprod-session-cleanup-{p|s}-*` schedule exists before `arm`.

   It prints names, states and times only. Any AWS error, missing field or unexpected shape is a
   FAIL with a code.
2. **New step "H-20 gate"** in job `session`, as the **first** step after "Does the nonprod stack
   exist". It runs with `if: env.SESSION == 'up'` and uses the deployer session credentials the job
   already assumes. On FAIL it exits non-zero. GitHub then skips every later step: plan, database
   start and apply. The `database` job does not run for `up`, and the existing "Stop the database"
   step runs only for `down` or a failed `up`. So a gate failure leaves AWS untouched, and the stop
   step makes sure the database stays stopped. **`down` is never gated**, so a broken cleanup can
   never block a shutdown.
3. **Bootstrap change (with its own reviewed plan and apply, like D-B2R).** Add
   `states:ListExecutions` and `states:DescribeExecution` on
   `stateMachine:munaxa-nonprod-session-cleanup` and its `execution:` ARNs to the session role's
   `RefreshSessionCleanup` statement. `scheduler:GetSchedule`, `scheduler:ListSchedules` and
   `cloudwatch:DescribeAlarms` are already in `deployer_read` (to be confirmed in the PR by a
   rendered-policy test). Expected bootstrap plan: `0 to add, 1 to change, 0 to destroy` on
   `aws_iam_policy.deployer_session_read["nonprod"]`. No write permission is added.
4. **Arming stays manual for now.** `arm` creates schedules, which is a write. It stays an operator
   step under the Stage E procedure. The workflow gate only refuses `up` if the cleanup is not
   proven working. A later option is to arm P/S in the workflow, as a separate decision.

## 3. Tests (in the same code PR)

- **Gate script.** A shell test harness with a stubbed `aws` binary covers each condition failing on its own:
  - no state machine; not ACTIVE;
  - no success; last success older than 26 h;
  - last success a dry run; a RUNNING execution;
  - R disabled; R with the wrong target or the wrong input;
  - an alarm missing; an alarm in ALARM;
  - a leftover P/S;
  - an AWS error; malformed JSON.

  It also covers one PASS case.
- **Parity.** A test runs the same fixtures through the connector `gate` (via `sandbox_harness`), so the two can never disagree.
- **Workflow structure.** A test checks `aws-session.yml` as YAML:
  - the gate step exists, with `if: env.SESSION == 'up'`;
  - it comes before "Plan the switches", "Start the database" and "Apply the switches";
  - no `continue-on-error`;
  - `down` paths do not depend on it.
- **Bootstrap.** A `bootstrap.tftest.hcl` assertion checks that the two read actions are present, on nonprod ARNs only, and that the session role has no `states:Start*`, `states:Stop*` or write action.

## 4. Failure behaviour

| Situation | Result |
| --- | --- |
| Gate FAIL on `up` | The job fails at the gate step. No plan, no database start, no apply. The step summary shows the failed condition code. The database is stopped by the existing stop step |
| AWS or permission error in the gate | FAIL (fail closed) |
| Gate PASS | Continues as today. The operator still runs `arm` per the Stage E procedure |
| Scheduled `down` | Not affected |

## 5. Rollout order (each a separate owner yes)

1. Code PR H-20E (script, step, tests) and the bootstrap read change in the same PR. Merging changes nothing live.
2. Owner bootstrap plan and apply for the two read actions. The same plan and apply script pattern as D-B2R is used, with an exact 0/1/0 check.
3. Verification: after R has succeeded, Claude reads the gate's inputs read-only. The first real `up` remains part of Stage E, which is NOT AUTHORIZED.

Until then, H-20 remains procedural (risk R-4).
