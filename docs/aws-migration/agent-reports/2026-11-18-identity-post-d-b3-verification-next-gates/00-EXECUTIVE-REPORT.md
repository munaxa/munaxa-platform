# Post D-B3 verification and next Identity gates: executive report (18 Nov 2026)

**Current status (19 Nov 2026, 03:50 UTC; this list supersedes every older status line in this folder):**

- **Owner decisions, 19 Nov 03:16 UTC ("Subscribe run merge"):**
  - yes to D-B5;
  - yes to D-B4;
  - yes to merging #139, then #140, then this PR.
  - Applying #140's IAM still needs its own plan and a separate yes.
- **D-B2, D-B3/D-PIN, D-B2R: APPLIED AND VERIFIED.**
- **First real cleanup run R: SUCCEEDED** at 21:05 UTC on 18 Nov. **The `not-run` alarm has been OK since 22:06:11 UTC**, and all H-20 conditions were satisfied live at 22:09 UTC (file 17 §1.1).
- **PR #139 (R-8): MERGED** at 03:17 UTC as `ff8733c`.
- **PR #140 (H-20 enforcement): MERGED** at about 03:32 UTC as `4591bda`. CI was green on the updated head `0926bdb`, and bootstrap tests passed 20/20 locally.
- **What #140 means on `main` now:**
  - every Testing `up` passes through the gate;
  - the gate fails, safely, until the owner bootstrap plan and apply for the two read actions;
  - `down` is unaffected.
- **Bootstrap code on `main` now differs from the live IAM.** The expected bootstrap plan is **0 to add, 1 to change, 0 to destroy** on `aws_iam_policy.deployer_session_read["nonprod"]`, with or without the flag. It is **not planned and not applied**, and needs owner action (file 17 §6).
- **D-B5: COMPLETED AND VERIFIED.** Precheck PASS, then one `sns:Subscribe` at 03:43:06 UTC (subscription ARN ends `9777`). The owner confirmed the e-mail. At 03:46:01 UTC AWS shows 1 confirmed, 0 pending, protocol email, endpoint `alert@munaxa.com`, and no other subscription (file 17 §4.1).
- **D-B4: COMPLETED AND VERIFIED.** Precheck PASS at 03:44:59 UTC, and the live definition is byte-identical to the template (SHA-256 `4f6397ee…0ed`). One execution, `dry-run-idle-20261119T0345`, started at 03:45:34 UTC with `{"dryRun":true}`. It SUCCEEDED at 03:45:36 UTC: secret absent, alb absent, ecs done, database stopped. Only read operations were scheduled (file 17 §5.1). **Until R at 21:05 UTC tonight, H-20 condition 3 fails, as expected.**
- **Scheduled `down` after the D-B2R fix: WAITING FOR SCHEDULE.** No run had started by 22:25 UTC, and nothing was dispatched.
- **Stage E: NOT AUTHORIZED.** Production is out of scope.

**Owner instruction.** 18 Nov 2026, 09:59 UTC, "Post D-B3 Verification, Report Correction and
Next-Gate Preparation". The owner asked that nothing be merged automatically.

**Baseline:** `main` `3453f13637907bfc0cd39ace12a0672e5f1e1bf7`.

| # | Item | Result | Status | File |
| --- | --- | --- | --- | --- |
| 1 | Baseline and history | PRs #129, #131–#136 confirmed on `main` with their squash commits. Since the D-B2 apply (`9752146`), `main` has not changed the bootstrap | VERIFIED | 01 |
| 2 | Applied state | D-B2 (owner CloudShell log). D-B3/D-PIN: run 44267788619 success (enforced plan, saved-plan apply, plan SHA `b43440ef…`). Follow-up run 44268194074 success, no changes. No production change. No Stage E | VERIFIED from records. At 10:35 UTC live was NOT VERIFIED; live state then read at 12:43 and 14:20 UTC (files 11, 14) | 02 |
| 3 | Report correction | PR #135's executive status, row 8 and README index row now say D-B3/D-PIN is applied. Dated status notes were added to files 02 and 03, and their history is kept. Infrastructure is kept distinct from operations | Done in this PR | 2026-11-16 folder |
| 4 | Scheduled `down` | Run 44274042137 (09:14 UTC, the first after the apply): **failure** at "Plan the switches", now on `states:ListStateMachineVersions`. Database stop **success**. No later scheduled run yet. No cleanup execution expected before R at 21:05 UTC. No ECS task or service started (records) | VERIFIED (GitHub) | 03 |
| 5 | Fix | PR #137 (code; at 10:35 UTC unmerged, **merged 13:24 UTC as `a976b1a`, applied 13:37 UTC**, files 12–13): one read action for the session role. Bootstrap tests 14/14. The expected bootstrap plan is `0 to add, 1 to change, 0 to destroy`. Owner plan and apply scripts are in `supporting/`, tested offline | **APPLIED AND VERIFIED** (owner log + live read) | 04, 12, 13 |
| 6 | D-B5 subscription | Script with `precheck`, `subscribe` and `verify` modes (one `sns:Subscribe` for `alert@munaxa.com`, never Publish). The owner must click the confirmation e-mail. It is called subscribed only when AWS confirms | PREPARED — OWNER ACTION REQUIRED | 05 |
| 7 | Idle dry run | Script with `precheck`, `start` and `status` modes (`{"dryRun":true}` only, idle checks, a start window of 00:00–20:39 UTC, enforced, and a history check that no write was scheduled). Graph-checked: every write task sits behind its dry-run guard | PREPARED — OWNER ACTION REQUIRED | 06 |
| 8 | H-20 | Not yet satisfiable: no real success exists before R at 21:05 UTC. `not-run` in ALARM since 09:19 UTC (live, files 11 and 14). **The gate is procedural, not enforced by `aws-session.yml`** | BLOCKED | 07 |
| 9 | Audit exception | Limited to GHSA-fc5q-39xc-vjpf. No other high advisory is hidden, and CI still fails on any other. No fix has been released (latest 4.0.7). Dev and lint tooling only. The reach text in `AUDIT-EXCEPTIONS.md` was corrected, with the scope unchanged | VERIFIED | 08 |
| 10 | Tests and review | All relevant offline suites pass; supporting scripts 20/20; PR #137 CI all success. Independent review: no Critical or High; 1 Medium and 9 Low, all fixed. `shellcheck` not run (not installed) | VERIFIED (offline) | 09 |
| 11 | Risks, next decisions, not performed | At 10:35 UTC the next decision was D-B2R (since done). Current risks and decisions: file 15 | — | 10, 15 |

## Required statements

- Until 12:41 UTC no AWS call was made (connector sign-in). After the owner reconnected it, Claude made read-only calls only (files 11, 13, 14, 15); no write.
- Claude ran no Terraform plan or apply against AWS and dispatched no workflow. The only apply was the owner's reviewed D-B2R apply in CloudShell (file 13). The only workflow action by Claude was one re-run of a failed CI job on this PR (file 09 §6).
- Writes on 19 Nov, each on the owner's yes: one `sns:Subscribe` (D-B5) and one dry-run `StartExecution` (D-B4). No other write: no real cleanup, RDS start, ECS service or task, migration, bootstrap, DB-admin task, operator secret, C-8G or Stage E.
- No secret value was read.
- No production change.
- Claude merged PR #137 (18 Nov 13:24 UTC), #139 and #140 (19 Nov 03:17 and 03:32 UTC), each on the owner's explicit yes. This PR is merged after them on the same yes. Claude approved none of its own PRs.

## Recommendation

**Current (21:55 UTC):** see file 15 §3. The original 10:35 UTC recommendation below was carried out at 13:24–13:37 UTC.

The next safe action was **D-B2R**:

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
| 14 | After D-B2R: scheduled `down` and the first real cleanup run (R) |
| 15 | Current status, risks, next owner decisions, actions not performed (14:30 UTC) |
| 16 | Design proposal: enforce H-20 before every Testing `up` (now implemented in PR #140, file 17) |
| 17 | Evening round (21:33 UTC brief): live state, R-8 PR #139, H-20 PR #140, connector fix, D-B5/D-B4 owner instructions, bootstrap plan gates |
| `supporting/` | `d-b2r-plan-owner-cloudshell.sh` and `d-b2r-apply-owner-cloudshell.sh` (run by the owner), `d-b5-alert-subscription.py` and `d-b4-dry-run-idle.py` (shared helpers v2, not run against AWS), `test_next_gate_connector_scripts.py` |
