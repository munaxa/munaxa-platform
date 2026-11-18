# 15. Current status, risks, next owner decisions, actions not performed (18 Nov 2026, 14:30 UTC; updated 21:55 UTC)

> **Updated 18 Nov 21:55 UTC** (owner brief 21:33 UTC, file 17):
>
> - R SUCCEEDED; the H-20 connector gate passes 7 of 8 checks live, all except the `not-run` alarm.
> - R-8 and H-20 enforcement are now code PRs: #139 and #140, PREPARED, unmerged.
> - A live-sandbox error-handling defect was found in every connector script and fixed (file 17 §3).
> - The risk rows below were re-read live at 21:5x UTC.
> - The 14:30 UTC text is kept where it is still true. Changed rows are marked "21:55".

This file supersedes file 10's sections 1 and 2 for the current state. File 10 is kept as the 10:35 UTC record.

## 1. Four separate layers

| Layer | State | Status |
| --- | --- | --- |
| **Repository** | `main` `a976b1a` includes PR #137. PR #138 (this report, documentation and procedure scripts that have not been run) is open and unmerged | VERIFIED FROM GITHUB RECORDS |
| **Applied infrastructure** | D-B2 (16 Nov), D-B3/D-PIN (18 Nov 08:34, run 44267788619) and D-B2R (18 Nov 13:37, owner CloudShell) are applied. The live session-read policy is `v3` and includes `states:ListStateMachineVersions` | D-B2R VERIFIED FROM OWNER LOG and VERIFIED LIVE — READ ONLY |
| **Operational execution** | R's first real run SUCCEEDED at 21:05 UTC (no write needed). No scheduled `down` since the fix (19:17 UTC slot not started at 21:28 UTC). No dry run. No subscription. No session | R VERIFIED LIVE — READ ONLY; `down` WAITING FOR SCHEDULE (file 14) |
| **Authorization to proceed** | D-B5, D-B4 and Stage E are not authorized | NOT AUTHORIZED |

## 2. Risks

### Verified current facts

These were read today, at 14:20 UTC, using read-only calls. Status: VERIFIED LIVE — READ ONLY.

| Id | Risk | Evidence | Assessment |
| --- | --- | --- | --- |
| R-1 | The scheduled `down` failed at the switch plan | Cause fixed (file 13). Not yet proven by a run. 21:55: the 19:17 UTC slot had still not been started by GitHub (latest run is 44274042137) | WAITING FOR SCHEDULE. No replacement dispatched |
| R-3 | The cleanup alarms notify nobody | The topic has 0 confirmed, 0 pending and 0 deleted subscriptions | Open until D-B5. R's first run tonight has no alert delivery |
| R-4 | H-20 is not enforced by `aws-session.yml` | The `up` path on `main` has no gate step (code read) | 21:55: enforcement implemented in **PR #140** (PREPARED, unmerged). Live only after merge, the owner bootstrap plan/apply for 2 read actions, and the first armed `up` (Stage E, NOT AUTHORIZED) |
| R-5 | The `not-run` alarm is in ALARM | State `ALARM` since 09:19:06 UTC; still ALARM at 21:50 UTC although the 21:00 hour has `ExecutionsSucceeded` Sum 1 | 21:55: expected to clear when CloudWatch evaluates the 21:00–22:00 period (after 22:00 UTC). Blocks H-20 until a live read shows OK |
| S-2 | The RDS-managed master secret carries an `AWSPENDING` label | 21:55, metadata only (`DescribeSecret`, `ListSecretVersionIds`; no value): 2 versions. `AWSPENDING` sits on the **same** version as `AWSCURRENT` (…fd59d5, created 13 Nov 17:25), and `AWSPREVIOUS` is …c17fde (6 Nov). Rotation is on; last rotated 13 Nov 17:26; next 20 Nov 23:59 | Open, Low. This is not a half-finished rotation, because the pending and current versions are the same. The next rotation falls while the database is stopped and may fail or be deferred. Recheck after 21 Nov |
| S-3 | The `*.test.munaxa.com` certificate is not auto-renewable while unused | 21:55: `ISSUED`, not after 2027-05-22, renewal `INELIGIBLE`, in use by 0 | Open, Low. ACM renews only certificates that are in use. Use it in a session or re-request before about April 2027 |
| B-1 | The US$10 account budget is exceeded | 21:55: `munaxa-account-monthly` US$11.76 of 10. The US$50 budgets: shared account US$11.76, Testing US$3.41. Docs eu-prod: US$5.90 of 10 | Open, non-blocking (alert-only budget, decision D-N1 still pending). Binding budgets are well under limit. Nothing runs between sessions |
| R-10 | The operator secret has not been created | 21:55: `ListSecrets` name filter `munaxa-nonprod/identity-operator`: 0 (no value read) | Expected: C-8G is not authorized. The identity-bootstrap task cannot run, which is fail-closed |
| R-11 | (new, 21:55) Every connector script failed on any AWS error in the live sandbox | Live: `ClientError` is not defined (NameError). `code_of()` used `isinstance(e, ClientError)` | Fixed in code: PR #140 (four connector scripts, harness) and this PR (D-B4, D-B5). Without the fix, H-20 `arm`/`disarm` and the D-B4 precheck could not run. Nothing was ever run with the defect |

### Repository facts

| Id | Risk | Evidence | Next step |
| --- | --- | --- | --- |
| R-7 | `envs/nonprod.expected-changes.json` still declares the 12 applied D-B3/D-PIN changes | File content on `main` | Follow-up plan 44268194074 showed no changes, so a report-mode plan now reports 12 declared-but-absent changes, and an `--enforce` plan for **any** new change fails until the declaration is replaced. `--enforce` also refuses an empty declaration. So the correct update is **not** "empty it": the next stack configuration PR must replace the 12 with exactly its own changes and a new intent. Until then the declaration fails closed, which is safe. No change in this docs PR |
| R-8 | Every bootstrap plan or apply must pass `-var testing_session_cleanup=true`, or it removes D-B2 | `variables.tf` on `main`: `default = false` | 21:55: fixed in **PR #139** (default true, three test runs, 16/16; PREPARED, unmerged). Until it is merged, keep passing the flag. After it is merged, a real bootstrap plan must show **No changes** |
| R-9 | picomatch GHSA-fc5q-39xc-vjpf is ignored | The npm advisory database lists the vulnerable range as `<=4.0.7`. The latest published version is 4.0.7. **No patched version exists** (checked 14:2x UTC) | Keep the exception exactly as scoped. Do not broaden it. Remove it only when a verified fixed release exists. Re-review 18 Dec 2026 |
| B-H1 | Bounded bootstrap secret-read window (accepted residual risk) | 15 Nov decision record | Unchanged, could not be re-tested (it needs Stage E). Inherited |

## 3. Exact next owner decisions (21:55 UTC; the 14:30 list is superseded)

| # | Decision | Recommended | Notes |
| --- | --- | --- | --- |
| 1 | **D-B5**: authorize Claude to run the one `sns:Subscribe` for `alert@munaxa.com` | **Yes** | Then the owner clicks "Confirm subscription". File 17 §4 |
| 2 | **D-B4**: authorize Claude to start the one idle dry run | **Yes**, on 19 Nov between 00:00 and 20:39 UTC (03:00–23:39 Jordan time) | H-20 condition 3 then fails until that evening's R. File 17 §5 |
| 3 | **PR #139 (R-8)**: merge | Yes, once review and CI are green | Then a real bootstrap plan must show No changes (file 17 §6) |
| 4 | **PR #140 (H-20)**: merge | Yes, once review and CI are green | Then the owner bootstrap plan (0/1/0) and a separate apply yes (file 17 §6) |
| 5 | **PR #138** (this report): merge | Yes, once CI is green | Docs and supporting scripts only |
| 6 | Stage E (D-E) | Not requested | NOT AUTHORIZED |

## 4. Actions not performed (this whole task, 18 Nov; still true at 21:55 UTC)

- **PRs:** Claude did not merge PR #138, #139 or #140, and did not submit a review on them or approve any PR. PR #137 was merged only on the owner's explicit yes.
- **Terraform and workflows:** no Terraform plan or apply by Claude against AWS. No workflow was dispatched. The only workflow action was one re-run of a failed CI job on PR #138.
- **AWS writes:** no IAM, KMS, Secrets Manager, CloudFormation, SNS, Step Functions, Scheduler, ECS or RDS write by Claude.
- **SNS:** no subscription, and no test message.
- **Cleanup:** no dry run and no real cleanup started by Claude. R and the backstop were not modified.
- **Services and data:** no RDS start or stop, no ECS service or task, no Identity migration, bootstrap or DB-admin task.
- **Secrets:** no secret value read. Only `DescribeSecret` and `ListSecrets` metadata were read. No operator secret, no password, and no C-8G.
- **Gates:** H-20 was not bypassed. Its read-only `gate` mode was run live once, at 21:50 UTC, with FAIL on the alarm only. Its enforcement is code in PR #140, not live. Stage E was not started.
- **Production and dependencies:** no production change. No dependency upgraded or overridden, and the audit exception was not broadened.
