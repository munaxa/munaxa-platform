# H-20 IAM bootstrap plan and verification: executive report (19 Nov 2026)

**Status, 19 Nov 2026 at 09:40 UTC: PREPARED, waiting for the owner's plan-only CloudShell run. No apply was performed.**

**Owner instruction.** 19 Nov 2026 at 08:53 UTC, "Execute the Next Approved Gate: H-20 IAM Bootstrap Plan and Verification".
- Plan only.
- Terraform apply is **not authorized**.
- Stage E remains **NOT AUTHORIZED**.

**Baseline.** `main` at `0f06836c06b2c76ab62699489e67e040a867b360`.

| # | Item | Result | Status | File |
| --- | --- | --- | --- | --- |
| 1 | Repository state | `main` `0f06836` contains #139 (`ff8733c`), #140 (`4591bda`) and #138 (`0f06836`). CI was green on all three `main` pushes | VERIFIED (GitHub) | 01 |
| 2 | R-8 code | `testing_session_cleanup` defaults to `true`. Tests prove that omitting the variable keeps all three cleanup grants and changes nothing for prod | VERIFIED (code and tests) | 01 |
| 3 | H-20 code | The gate runs before init, plan, DB start and apply for every `up`. It fails closed, has no `continue-on-error`, and `down` never depends on it. The two new reads are limited to the nonprod cleanup state machine and its executions. No prod permission | VERIFIED (code and tests) | 01 |
| 4 | Tests | Bootstrap `terraform test` 20/20. Connector suite 141/141. New owner-script tests 19/19 | VERIFIED (local, 19 Nov) | 01, 03 |
| 5 | Operational baseline | Live read-only checks at 08:56 UTC: Testing idle, the state machine ACTIVE/STANDARD, latest real success R at 21:05 on 18 Nov, nothing RUNNING, R enabled with the right target and input, both alarms OK, 11 backstop schedules ENABLED, no P/S schedule | VERIFIED LIVE | 02 |
| 6 | H-20 gate (read-only) | **FAIL on exactly one condition**, `last_success_was_real`: the latest success is the owner-approved D-B4 dry run at 03:45 UTC. All 7 other conditions pass. This is expected until R at 21:05 UTC tonight | VERIFIED LIVE (expected FAIL) | 02 |
| 7 | Scheduled `down` after D-B2R | Run 44435648783 at 01:16 UTC on 19 Nov: **success**, including "Plan the switches" and "Apply the switches". The D-B2R fix works in operation | VERIFIED (GitHub) | 02 |
| 8 | Live IAM against code | The live boundary, session-read and session-cleanup policies equal the D-B2R code, so there is no drift. The session-read policy (v3) does not yet contain `GateSessionCleanup` | VERIFIED LIVE | 02 |
| 9 | Expected plan | **0 to add, 1 to change, 0 to destroy**: `aws_iam_policy.deployer_session_read["nonprod"]`, policy attribute only. It adds only `GateSessionCleanup`: `states:ListExecutions` and `states:DescribeExecution` on the nonprod cleanup state machine and its executions. The policy grows from 1,504 to 1,798 characters | PREPARED (rendered offline by the real provider, checked against live) | 03 |
| 10 | Owner CloudShell plan script | `supporting/h20-iam-plan-owner-cloudshell.sh` (SHA-256 `abbddb19…091d`). Plan only, all 11 required checks, and stops on any deviation | PREPARED, WAITING FOR OWNER RUN | 03 |
| 11 | Apply script and post-apply checks | `supporting/h20-iam-apply-owner-cloudshell.sh` (SHA-256 `23f0a673…a3bd`). It applies only the saved plan with the reviewed SHA-256 | PREPARED, **NOT AUTHORIZED** | 04 |
| 12 | Monitoring and risks | Current evidence on R, the scheduled `down`, alarms, SNS, RDS secret rotation, the certificate, budgets and picomatch | VERIFIED LIVE / VERIFIED (sources in file 02) | 02 |

## What remains before a Testing `up` can safely run

1. **The owner runs the plan script** in CloudShell and pastes the log.
2. **Claude reviews the saved plan** against file 03 §4, and posts the verdict with the plan SHA-256.
3. **A separate owner yes** to apply that exact saved plan, followed by the apply script.
4. **Claude verifies the result**: the post-apply plan reports no changes, live IAM matches, and the H-20 gate PASSes read-only after a real R success.
5. **Per session**, still required by H-20 and the runbook:
   - the operator arms P and S with the connector;
   - the `up` is dispatched with `hard_stop_utc` 1–6 h ahead, before 21:00 UTC;
   - that dispatch is its own owner decision.

   Stage E, and the C-8G operator secret it needs, stay **NOT AUTHORIZED**.

Until step 3 is done, every Testing `up` is refused at the gate, which is safe. `down` is unaffected.

## Required statements

- **No Terraform plan or apply was run against AWS.** Claude ran no workflow and started no execution.
- **AWS calls in this task were read-only only** (file 02 lists them). No secret value was read; secret checks were metadata only (`DescribeSecret`).
- **No change** to RDS, ECS, schedules, alarms, budgets, certificates, dependencies, secrets, IAM or production.
- **No Stage E action.**
- **Nothing merged and nothing approved by Claude** in this task. The report PR stays open for the owner.

## Files

| File | Content |
| --- | --- |
| 00 | This report |
| 01 | Repository state, PRs, CI, code verification, tests |
| 02 | Live operational baseline, H-20 gate, monitoring and risks |
| 03 | Owner CloudShell plan procedure, expected plan, rejection conditions, review checklist |
| 04 | Apply boundary, post-apply verification, next owner authorization request |
| `supporting/` | Plan script, apply script (not authorized), offline tests and fixture |
