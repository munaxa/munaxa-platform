# Post D-B3 verification and next Identity gates: executive report (18 Nov 2026)

**Status:**

- **D-B2 and D-B3/D-PIN: APPLIED AND VERIFIED** (records).
- **D-B2R: APPLIED AND VERIFIED** 18 Nov 13:37 UTC by the owner (0/1/0, post-apply no changes; live policy v3 re-read by Claude; file 13). Scheduled shutdown switch plan: NOT VERIFIED until the next scheduled run.
- **D-B5 and the dry run: PREPARED, OWNER ACTION REQUIRED.**
- **H-20: BLOCKED.**
- **Live AWS check: VERIFIED at about 12:43 UTC** (addendum, file 11): nothing running, database stopped, 0 cleanup executions, `not-run` alarm in ALARM, no subscriber, session policy lacks the one read that PR #137 adds.
- **Stage E: NOT AUTHORIZED.**

**Owner instruction.** 18 Nov 2026, 09:59 UTC, "Post D-B3 Verification, Report Correction and
Next-Gate Preparation". The owner asked that nothing be merged automatically.

**Baseline:** `main` `3453f13637907bfc0cd39ace12a0672e5f1e1bf7`.

| # | Item | Result | Status | File |
| --- | --- | --- | --- | --- |
| 1 | Baseline and history | PRs #129, #131–#136 confirmed on `main` with their squash commits. Since the D-B2 apply (`9752146`), `main` has not changed the bootstrap | VERIFIED | 01 |
| 2 | Applied state | D-B2 (owner CloudShell log). D-B3/D-PIN: run 44267788619 success (enforced plan, saved-plan apply, plan SHA `b43440ef…`). Follow-up run 44268194074 success, no changes. No production change. No Stage E | VERIFIED from records. **Live NOT VERIFIED** | 02 |
| 3 | Report correction | PR #135's executive status, row 8 and README index row now say D-B3/D-PIN is applied. Dated status notes were added to files 02 and 03, and their history is kept. Infrastructure is kept distinct from operations | Done in this PR | 2026-11-16 folder |
| 4 | Scheduled `down` | Run 44274042137 (09:14 UTC, the first after the apply): **failure** at "Plan the switches", now on `states:ListStateMachineVersions`. Database stop **success**. No later scheduled run yet. No cleanup execution expected before R at 21:05 UTC. No ECS task or service started (records) | VERIFIED (GitHub) | 03 |
| 5 | Fix | PR #137 (code, unmerged): one read action for the session role. Bootstrap tests 14/14. The expected bootstrap plan is `0 to add, 1 to change, 0 to destroy`. Owner plan and apply scripts are in `supporting/`, tested offline | PREPARED — OWNER ACTION REQUIRED | 04 |
| 6 | D-B5 subscription | Script with `precheck`, `subscribe` and `verify` modes (one `sns:Subscribe` for `alert@munaxa.com`, never Publish). The owner must click the confirmation e-mail. It is called subscribed only when AWS confirms | PREPARED — OWNER ACTION REQUIRED | 05 |
| 7 | Idle dry run | Script with `precheck`, `start` and `status` modes (`{"dryRun":true}` only, idle checks, a start window of 00:00–20:39 UTC, enforced, and a history check that no write was scheduled). Graph-checked: every write task sits behind its dry-run guard | PREPARED — OWNER ACTION REQUIRED | 06 |
| 8 | H-20 | Not yet satisfiable: no real success exists before R at 21:05 UTC. `not-run` is probably in ALARM. Live conditions not read. **The gate is procedural, not enforced by `aws-session.yml`** | BLOCKED | 07 |
| 9 | Audit exception | Limited to GHSA-fc5q-39xc-vjpf. No other high advisory is hidden, and CI still fails on any other. No fix has been released (latest 4.0.7). Dev and lint tooling only. The reach text in `AUDIT-EXCEPTIONS.md` was corrected, with the scope unchanged | VERIFIED | 08 |
| 10 | Tests and review | All relevant offline suites pass; supporting scripts 20/20; PR #137 CI all success. Independent review: no Critical or High; 1 Medium and 9 Low, all fixed. `shellcheck` not run (not installed) | VERIFIED (offline) | 09 |
| 11 | Risks, next decisions, not performed | The next decision is D-B2R. Everything not performed is listed | — | 10 |

## Required statements

- No AWS call of any kind was made by Claude in this task: the read-only check was blocked by the connector sign-in.
- No Terraform plan or apply ran against AWS, and no workflow was dispatched.
- No SNS subscription, dry run, real cleanup, RDS start, ECS service or task, migration, bootstrap, DB-admin task, operator secret, C-8G or Stage E.
- No secret value was read.
- No production change.
- Nothing was merged or approved by Claude.

## Recommendation

The next safe action is **D-B2R**:

1. merge PR #137;
2. the owner runs the plan-only script in CloudShell;
3. Claude reviews the log;
4. a separate yes for the apply.

Until then every scheduled `down` fails at its switch step, though the database is still stopped.
It is also the precondition for any later session.

## Files

| File | Content |
| --- | --- |
| 00 | This report |
| 01 | PR and commit history, baseline |
| 02 | D-B2 and D-B3/D-PIN applied-state evidence |
| 03 | Scheduled `down` verification and root cause |
| 04 | D-B2R fix (PR #137) and owner procedure |
| 05 | D-B5 subscription procedure |
| 06 | D-B4 idle dry-run procedure |
| 07 | H-20 gate assessment |
| 08 | Audit exception assessment |
| 09 | Tests and independent review |
| 10 | Risks, next owner decisions, actions not performed |
| 11 | Addendum: live read-only AWS check (12:43 UTC) |
| 12 | D-B2R owner plan review (PLAN VERIFIED) |
| 13 | D-B2R apply result (APPLIED AND VERIFIED 13:37 UTC) |
| `supporting/` | `d-b2r-plan-owner-cloudshell.sh`, `d-b2r-apply-owner-cloudshell.sh`, `d-b5-alert-subscription.py`, `d-b4-dry-run-idle.py`, `test_next_gate_connector_scripts.py` (none run against AWS) |
