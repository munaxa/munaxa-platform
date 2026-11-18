# 17. Next gates: live state, R-8, H-20 enforcement, D-B5 and D-B4 (18 Nov 2026, evening)

**Owner instruction.** 18 Nov 2026, 21:33 UTC: "Munaxa AWS Identity — Complete Next Gates, Enforce
H-20, and Prepare Safe Testing Operations".

Evidence labels used here:

- **VERIFIED LIVE**: read by Claude through the AWS connector (root, read-only), at the time given;
- **GitHub records**: GitHub API;
- **owner log**: output the owner pasted;
- **NOT VERIFIED**: not checked, or not yet possible.

No AWS write was made for this file.

## 1. Live operational state

| Item | Result | Evidence |
| --- | --- | --- |
| R (first real cleanup) | execution `1a6afe12-fcc7-48a0-bad9-043f5c61bd30`, **SUCCEEDED** 21:05:22.079–21:05:23.202 UTC, input `{"dryRun":false}`; still the only execution at 21:35 UTC | VERIFIED LIVE 21:35 UTC (details in file 14 §2) |
| `ExecutionsSucceeded` metric | Sum **1** for the 21:00–22:00 UTC hour | VERIFIED LIVE 21:35 UTC |
| Alarm `munaxa-nonprod-session-cleanup-failed` | **OK** since 08:35:08 UTC. 1 period, threshold ≥ 1, missing data not breaching | VERIFIED LIVE 21:35 UTC |
| Alarm `munaxa-nonprod-session-cleanup-not-run` | **ALARM** since 09:19:06 UTC. Reason: "no datapoints were received for 26 periods … treated as [Breaching]". Period 3600 s, 26 evaluation periods, 26 datapoints to alarm, Sum < 1, missing data **breaching**. Only history item: INSUFFICIENT_DATA → ALARM 09:19:06. No OK actions, so a recovery sends no mail | VERIFIED LIVE 21:35 and 21:50 UTC; re-checked later, see §1.1 |
| H-20 (connector gate, read-only) | **FAIL** at 21:50:13 UTC on `alarms_not_in_alarm` only. The other seven checks pass (state machine ACTIVE, real success within 26 h, nothing running, R enabled with correct target, role and input, both alarms present, no P/S schedule) | VERIFIED LIVE 21:50 UTC, the corrected script of PR #140 |
| Scheduled `down` after D-B2R | **Not started yet.** Latest `aws-session.yml` run is still 44274042137 (09:14 UTC, before the fix). The 19:17 UTC slot had not started by 21:36 UTC. Observed delays are hours: run 44217528747 for an earlier slot was created at 01:39 and waited until 08:16. No replacement was dispatched | GitHub records 21:36 UTC; see §1.1 |
| Idle | ECS cluster `munaxa-nonprod` present, no ALB, RDS `munaxa-nonprod-pg` **stopped** | VERIFIED LIVE 21:35 UTC |

**Why the alarm has not cleared yet.** This is CloudWatch's normal behaviour, not a fault:

- The alarm needs a breaching value in all 26 one-hour periods to stay in ALARM.
- The 21:00 hour now has `Sum = 1`. CloudWatch evaluates that period only once it can aggregate it, which is after 22:00 UTC.
- The alarm should then go to OK.
- "The successful R execution automatically cleared the alarm" is therefore **not** claimed. §1.1 records what was actually read.

### 1.1 Later re-check (22:09 UTC)

| Item | Result | Evidence |
| --- | --- | --- |
| Alarm `-not-run` | **OK since 22:06:11 UTC**. Reason: "1 out of the last 26 datapoints [1.0 (18/11/26 21:00:00)] was not less than the threshold". History: ALARM → OK at 22:06:11. No OK action, so no mail | VERIFIED LIVE 22:09 UTC |
| Alarm `-failed` | OK (unchanged since 08:35:08) | VERIFIED LIVE 22:09 UTC |
| H-20 conditions (the connector gate's eight) | **All satisfied.** State machine ACTIVE and STANDARD; latest success R stopped 21:05:23 with a real input; 0 RUNNING; R ENABLED with the correct target, role and input; both alarms present and OK; the only schedule with the prefix is `-daily` (no P/S) | VERIFIED LIVE 22:09 UTC, individual read-only calls |
| Idle | 0 ECS services, 0 tasks, 0 ALBs, RDS stopped | VERIFIED LIVE 22:09 UTC |
| Scheduled `down` after D-B2R | **Still not started.** Latest `aws-session.yml` run is 44274042137 (09:14 UTC) | GitHub records 22:09 UTC. WAITING FOR SCHEDULE, nothing dispatched |

What this means:

- H-20 is **satisfiable** now. The success window holds until R's success is 26 h old, at 19 Nov 23:05 UTC, and R refreshes it each evening.
- It is still **procedural**: enforcement is PR #140, which is not merged or live.
- It does **not** authorize Stage E.
- A D-B4 dry run on 19 Nov would make condition 3 fail until that evening's R (§5).

## 2. R-8: keep the applied cleanup IAM without `-var` (PR #139)

- **Change.** `infra/aws/bootstrap` `testing_session_cleanup` defaults to `true`. With the old default `false`, a root bootstrap plan that omitted the flag would remove:
  - the D-B2 nonprod boundary statements `TestingSessionCleanup` and `TestingSessionCleanupLookups`;
  - `deployer_session_cleanup` and its attachment;
  - `RefreshSessionCleanup`.

  That would break the scheduled `down` and the cleanup role.
- **Tests (offline, actual runs).** Bootstrap `terraform test` passes **16/16**. New runs:
  - `r8_session_cleanup_is_on_without_the_var`: everything is kept with no `-var`, and prod is unchanged;
  - `r8_explicit_true_matches_the_default`: the owner scripts' `-var testing_session_cleanup=true` is still valid and gives the same IAM;
  - `be2_session_cleanup_is_off_only_when_false`.

  `fmt` and `validate` pass. Mutation: putting the default back to `false` makes the new run fail.
- **Expected effect.** The live state was applied with `true`, so a real bootstrap plan after the merge should show **No changes**, with or without the var. This is an expectation, not a result: it must be proven by a real owner plan (§6).
- **Status: PREPARED.** Independent review found nothing (§3). CI green at `c757546`. Not merged. No apply.

## 3. H-20 enforcement (PR #140)

**Gate script `scripts/aws/session-cleanup-gate.sh`.** It is read-only and fails closed, and passes only when all ten conditions hold:

| # | Check | Meaning |
| --- | --- | --- |
| 1 | `state_machine_active` | the state machine is ACTIVE and STANDARD |
| 2 | `succeeded_within_26h` | its latest success is within 26 h |
| 3 | `last_success_was_real` | that success had input exactly `{"dryRun":false}` |
| 4 | `none_running` | none RUNNING |
| 5 | `daily_enabled` | R is ENABLED with the correct target |
| 6 | `daily_role_and_input` | R uses the correct role and input |
| 7 | `alarms_present` | both alarms exist |
| 8 | `alarms_not_in_alarm` | neither is in ALARM |
| 9 | `no_stale_session_schedules` | no other session's P/S |
| 10 | `own_session_armed` | this session's P and S exist exactly as the connector's `arm` creates them |

Input handling and output:

- The input `HARD_STOP_UTC` is validated: shape, 1 to 6 h ahead (as `arm` requires), and S before 21:00 UTC.
- Missing data, malformed JSON, AccessDenied or any other AWS error, or the wrong account each give FAIL.
- The output is limited to check names, true/false, error codes, alarm states and schedule names.

**Workflow `aws-session.yml`.**

- New input `hard_stop_utc`, passed through `env`.
- Step **H-20 gate** (`id: h20`, `if: env.SESSION == 'up'`), placed directly after "Does the nonprod stack exist".
- `terraform init`, Plan and Apply require `(env.SESSION != 'up' || steps.h20.outcome == 'success')`. Start the database requires `steps.h20.outcome == 'success'`.
- The final "Stop the database" step does not run after a failed gate, because a refused `up` started nothing (review M-1).
- `down` is never gated. There is no `continue-on-error`.

**IAM.**

- New nonprod-only statement `GateSessionCleanup`: `states:ListExecutions` and `states:DescribeExecution`, on `stateMachine:munaxa-nonprod-session-cleanup` and `execution:munaxa-nonprod-session-cleanup:*`.
- Already allowed, so not duplicated:
  - `states:DescribeStateMachine` (from `RefreshSessionCleanup`);
  - `scheduler:GetSchedule`, `scheduler:ListSchedules` and `cloudwatch:DescribeAlarms` (from `deployer_read` on `*`, attached to the session role).
- Rendered size of the session read policy: live v3 is 1,504 characters; with the new statement it is 1,798, against the 6,144 limit. Computed from the live document, read-only.

**Connector fix found while preparing D-B5/D-B4: shared helpers v2.**

- Observed live at 21:4x UTC: the connector sandbox has **no `ClientError` name**, although its tool description lists it.
- Every connector script's `code_of()` used `isinstance(e, ClientError)`, so any AWS error raised NameError instead of returning a code.
- Consequences:
  - H-20 `arm` and `disarm` could never have run, because "schedule not found" is their normal path;
  - D-B4's precheck would have crashed on its idle path, because "no load balancer" is an error code.
- Fixed in the four connector scripts (PR #140) and in the D-B4 and D-B5 scripts (this PR): `code_of()` now reads botocore's `.response`.
- The harness no longer provides `ClientError` and forbids the name, so tests match the live sandbox.
- The corrected gate was then run live, read-only (§1).

**Tests (offline, actual runs).**

- `test_session_cleanup_gate_workflow.py`, **22 tests** after the review fixes:
  - every listed failure case;
  - AccessDenied, with no message leak;
  - malformed JSON;
  - bad and late hard stops;
  - no write operation named;
  - **parity** with the connector gate on the same fake AWS (15 cases; the one difference by design is that the workflow refuses an unarmed session);
  - workflow structure;
  - the sandbox `ClientError` regression.
- Full connector suite: **141/141** at head `f121216`.
- Bootstrap **18/18**. The new runs check:
  - exact actions and resources;
  - only Describe/List/Get;
  - no `states:` action in the session deployer's own policy;
  - prod refused by validation, and no prod resource named.
- `shellcheck` 0.11.0: clean. A CI step is added.
- Mutation checks fail as expected: forcing PASS, skipping condition 10, dropping the gate from DB start, adding `states:StartExecution`, adding a duplicate read.

**Independent review.** A separate reviewer read both PRs read-only, without my conclusions, and found nothing Critical or High.

- Fixed in `f121216`:
  - **M-1:** a failed gate triggered the database stop;
  - **M-2:** the 30-minute hard-stop margin, against the 60 minutes `arm` requires;
  - **L-1, L-3, L-4.**
- Noted:
  - **L-2:** commit wording;
  - **L-5:** the IAM tests assert `.statement` because the provider is mocked; the size was computed separately;
  - **L-6:** `.response` without a code gives `PY_OTHER`, which fails closed.
- **L-7: merge #139 before #140**, or pass `-var testing_session_cleanup=true` (the owner scripts always do).
- The reviewer confirmed:
  - the two PRs merge cleanly (20/20 Terraform and 138 Python together);
  - the CLI flags and output shapes;
  - no fail-open path and no injection;
  - the ARN formats;
  - no reach into prod.
- No finding on R-8.

**Status: PREPARED.** Review is done; CI green at `f121216`. Not merged. No apply.

**Before the IAM is applied,** every `up` is refused at conditions 2–4 (AccessDenied). That is the safe direction, and `down` is unaffected.

## 4. D-B5: subscribe `alert@munaxa.com` (WAITING FOR OWNER AUTHORIZATION)

**Script.** `supporting/d-b5-alert-subscription.py`, SHA-256 `7ec3c1f8e2c8ff29cc34e254c59e9a022fb63139f034b23e92ecd61d02c1855d` (shared helpers v2).

**Safety, checked in the source and its tests:**

- The address is fixed to `alert@munaxa.com`. Any other value aborts with `ADDRESS_NOT_THE_APPROVED_ONE`.
- One topic only: `munaxa-nonprod-session-cleanup-alerts`, in this account.
- The only write is one `sns:Subscribe` (protocol email). It makes no `Publish`, `Unsubscribe`, `SetTopicAttributes`, `SetSubscriptionAttributes` or `ConfirmSubscription` call, and does not change the topic policy.
- It refuses when any subscription already exists, confirmed or pending, so there is never a second recipient or a duplicate.
- Precheck requires the topic ARN, the owner account, the TLS-only deny, and 0/0/0 counts.
- `verify` distinguishes ABSENT, PENDING (AWS still waits for the click) and CONFIRMED (AWS `PendingConfirmation` is `"false"`, protocol email). It fails on a non-email protocol or on more than one subscription.
- It reads no secret. The confirmation token exists only in the e-mail.
- Only the last 4 characters of the subscription ARN are returned.

**Exact steps** (Claude runs them through the connector; the owner only authorizes and clicks):

1. The owner writes in the thread: "Yes, subscribe alert@munaxa.com to the cleanup alert topic (D-B5)."
2. Claude runs `precheck`. It must PASS, and the result is posted.
3. Claude runs `subscribe` **once**. The expected result is `SUBSCRIBED_PENDING_CONFIRMATION`.
4. The owner opens the AWS Notifications e-mail at `alert@munaxa.com` and clicks **Confirm subscription**. Nothing else in the e-mail is needed.
5. Claude runs `verify`. It is reported as CONFIRMED only when AWS confirms. Until then it stays PENDING.

The benefit is small but real: the alarms have no OK actions, so only a cleanup failure or a missed run sends mail.

## 5. D-B4: one idle dry run (WAITING FOR OWNER AUTHORIZATION)

**Script.** `supporting/d-b4-dry-run-idle.py`, SHA-256 `7b57f5c78be98755e6214eb189aff53644b26b5a645a04ec663cbe388f165a29` (shared helpers v2).

**Safety, checked in the source and its tests:**

- The input is the constant `{"dryRun":true}`. It is not an operator input, so `false` cannot be passed.
- The live definition must still start with the `CheckInput` choice that refuses any non-boolean `dryRun`.
- Precheck refuses each of these:
  - an ECS service or task in `munaxa-nonprod`;
  - a load balancer `munaxa-nonprod`;
  - a database that is not stopped;
  - a RUNNING execution;
  - a time outside **00:00–20:39 UTC**.

  That window keeps the run clear of the 21:00 backstop and of R at 21:05 and its retry window, so it can never run after R on the same day.
- `start` makes exactly one `StartExecution`, named `dry-run-idle-<yyyymmddThhmm>`, so a retry in the same minute cannot start a second one. It returns the ARN at once.
- `status` requires all of the following:
  - SUCCEEDED;
  - output `dryRun` true;
  - the four branches secret absent, alb absent, ecs done, database stopped;
  - a history with **no** `deleteSecret`, `deleteLoadBalancer`, `updateService`, `stopTask` or `stopDBInstance` scheduled.
- It never calls StopExecution and never changes a schedule, R's input or any resource.

**UTC window from the current time.**

- When this file was written it was 18 Nov 21:55 UTC, which is 19 Nov 00:55 in Jordan (UTC+3).
- The window is **closed** now (after 20:39 UTC).
- The next window is **19 Nov 2026, 00:00–20:39 UTC = 03:00–23:39 Jordan time.**
- The script enforces this itself and refuses outside it.

**Side effect to accept.** Until that evening's R at 21:05 UTC, the dry run becomes the latest success, so H-20 condition 3 fails. No session is planned that day, so this only delays H-20 by one R cycle.

**Exact steps:**

1. The owner writes: "Yes, run one D-B4 idle dry run."
2. Claude runs `precheck` inside the window. It must PASS (idle, window, definition). Claude also compares the live definition with the reviewed template.
3. Claude runs `start` once and records the ARN.
4. Claude runs `status` until it is SUCCEEDED and every check passes, and reports it.

## 6. Bootstrap plan requirements and apply gates (for #139 and #140)

The same pattern as D-B2R applies. It is not started, and each step needs a separate owner yes:

1. Merge the code PR(s) only after review and CI are green and the owner says yes.
2. A **real plan** in CloudShell as root, from the merged `main` SHA. It must:
   - check account `229251310592`, region `eu-central-1`, and state `s3://munaxa-shared-tfstate-229251310592` (bootstrap key, lock object readable);
   - pass `-var testing_session_cleanup=true`;
   - save the plan with `-out` and record its SHA-256;
   - print only the addresses and actions.
3. Expected results:

   | Code merged | Expected plan |
   | --- | --- |
   | #139 only | **No changes** |
   | #140 (with or without #139) | **0 to add, 1 to change, 0 to destroy**, on `aws_iam_policy.deployer_session_read["nonprod"]` only, with the diff equal to the `GateSessionCleanup` statement |

   Any prod address, any other address or action, or drift is a STOP.
4. Claude reviews the plan log. The owner then gives a **separate explicit yes** for the apply.
5. The apply applies **exactly that saved plan**, with its SHA-256 checked first. It never uses `-auto-approve` on a fresh plan, and never applies a different plan.
6. After the apply:
   - a no-change plan is required;
   - the live policy is re-read and must equal the code;
   - Claude re-runs the gate's reads.

The owner scripts for this step are not yet written for #140. They will reuse the D-B2R scripts with the new expected address and statement, once the code is merged.

## 7. Not performed in this round

The following were not done:

- no SNS subscription;
- no dry run or real cleanup;
- no Terraform plan or apply against AWS;
- no workflow dispatch;
- no RDS or ECS start;
- no operator secret created or read;
- no C-8G, migration, bootstrap or DB-admin task;
- no ECS service;
- no Stage E;
- no production change;
- no change to the cleanup or backstop schedules;
- no H-20 bypass;
- no secret value read;
- no merge and no self-approval.

The first real cleanup success does **not** authorize Stage E.
