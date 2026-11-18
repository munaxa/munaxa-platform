# 15. Current status, risks, next owner decisions, actions not performed (18 Nov 2026, 14:30 UTC)

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
| R-1 | The scheduled `down` failed at the switch plan | Cause fixed (file 13). Not yet proven by a run | WAITING FOR SCHEDULE (file 14) |
| R-3 | The cleanup alarms notify nobody | The topic has 0 confirmed, 0 pending and 0 deleted subscriptions | Open until D-B5. R's first run tonight has no alert delivery |
| R-4 | H-20 is not enforced by `aws-session.yml` | The `up` path has no gate step (code read) | Open. Design proposal in file 16 (not implemented) |
| R-5 | The `not-run` alarm is in ALARM | State `ALARM` since 09:19 UTC | Expected until R's first success |
| S-2 | The RDS-managed master secret has a stale `AWSPENDING` stage | `DescribeSecret` metadata only (no value): 2 versions, stages `AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`; rotation on; last rotated 13 Nov 17:26; next 20 Nov 23:59 | Open, Low. The next rotation is likely to run while the database is stopped. Recheck after 21 Nov |
| S-3 | The `*.test.munaxa.com` certificate is not auto-renewable while unused | `ISSUED`, not after 2027-05-22, renewal `INELIGIBLE`, in use by 0 | Open, Low. Use it in a session or re-request before about April 2027 |
| B-1 | The US$10 account budget is exceeded | `munaxa-account-monthly` US$11.63 of 10. The US$50 budgets: shared account US$11.63, Testing US$3.35. Docs eu-prod: US$5.83 of 10 | Open, non-blocking (alert-only budget, decision D-N1 still pending). Binding budgets are well under limit |
| R-10 | The operator secret has not been created | `ListSecrets` name filter `munaxa-nonprod/identity-operator`: none (no value read) | Expected: C-8G is not authorized. The identity-bootstrap task cannot run, which is fail-closed |

### Repository facts

| Id | Risk | Evidence | Next step |
| --- | --- | --- | --- |
| R-7 | `envs/nonprod.expected-changes.json` still declares the 12 applied D-B3/D-PIN changes | File content on `main` | Follow-up plan 44268194074 showed no changes, so a report-mode plan now reports 12 declared-but-absent changes, and an `--enforce` plan for **any** new change fails until the declaration is replaced. `--enforce` also refuses an empty declaration. So the correct update is **not** "empty it": the next stack configuration PR must replace the 12 with exactly its own changes and a new intent. Until then the declaration fails closed, which is safe. No change in this docs PR |
| R-8 | Every bootstrap plan or apply must pass `-var testing_session_cleanup=true`, or it removes D-B2 | `variables.tf`: `default = false` | Durable fix, a separate code PR proposal: set `default = true` now that D-B2 is live, plus a `bootstrap.tftest.hcl` run that asserts a plan **without** any `-var` keeps the D-B2 boundary statements, `RefreshSessionCleanup` and `deployer_session_cleanup`. The owner scripts would then still pass the flag explicitly (harmless). Merging it changes nothing live, because the applied state already has the flag on, and a bootstrap plan after the merge must show **no changes**. Needs owner approval for the code PR. Not done here |
| R-9 | picomatch GHSA-fc5q-39xc-vjpf is ignored | The npm advisory database, queried today, lists the vulnerable range as `<=4.0.7`. The latest published version is 4.0.7 (24 Aug 2026). **No patched version exists** | Keep the exception unchanged. Re-review 18 Dec 2026, or as soon as a fixed version is published |
| B-H1 | Bounded bootstrap secret-read window (accepted residual risk) | 15 Nov decision record | Unchanged, could not be re-tested (it needs Stage E). Inherited |

## 3. Exact next owner decisions

| # | Decision | Recommended | Notes |
| --- | --- | --- | --- |
| 1 | **D-B5 yes/no**: Claude runs `d-b5-alert-subscription.py` (one `sns:Subscribe` for `alert@munaxa.com`), then the owner clicks "Confirm subscription" in the e-mail | **Yes, first.** It lets a failure of tonight's R, and every later failure, reach someone. The alarms have no OK actions, so a success sends no mail, and a `not-run` alarm already in ALARM sends none either | The precheck conditions hold now (empty topic). File 05 |
| 2 | **D-B4 yes/no**: Claude runs the idle dry run (`{"dryRun":true}`, 00:00–20:39 UTC only) | Yes, on 19 Nov **before** 20:39 UTC, after R's first success has been checked | A dry run on 18 Nov before R would be harmless, but running it on 19 Nov keeps tonight's R as the clean first evidence. File 06 |
| 3 | **R-8 code PR yes/no**: make `testing_session_cleanup` default to true, with a test | Yes | Code only. Its bootstrap plan must show no changes |
| 4 | **H-20 enforcement PR yes/no** (file 16) | Yes, before any Stage E | Code plus a small bootstrap change, each with its own approval |
| 5 | Stage E (D-E) | Not requested | NOT AUTHORIZED |

## 4. Actions not performed (this whole task, 18 Nov)

- **PRs:** Claude did not merge PR #138 or submit a review on it, and approved no PR. PR #137 was merged only on the owner's explicit yes.
- **Terraform and workflows:** no Terraform plan or apply by Claude against AWS. No workflow was dispatched. The only workflow action was one re-run of a failed CI job on PR #138.
- **AWS writes:** no IAM, KMS, Secrets Manager, CloudFormation, SNS, Step Functions, Scheduler, ECS or RDS write by Claude.
- **SNS:** no subscription, and no test message.
- **Cleanup:** no dry run and no real cleanup started by Claude. R and the backstop were not modified.
- **Services and data:** no RDS start or stop, no ECS service or task, no Identity migration, bootstrap or DB-admin task.
- **Secrets:** no secret value read. Only `DescribeSecret` and `ListSecrets` metadata were read. No operator secret, no password, and no C-8G.
- **Gates:** H-20 was not run, bypassed or modified. Stage E was not started.
- **Production and dependencies:** no production change. No dependency upgraded or overridden, and the audit exception was not broadened.
