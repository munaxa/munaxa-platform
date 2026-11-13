# 06. Deployment gates and open findings

This task requests no deployment authorization.

## Gates, in order

| Gate | State | Who |
| --- | --- | --- |
| A. Platform 2.5.0 published | done (12 Nov) | — |
| B. Identity images from `2db6ed9` | done (13 Nov), scans clean | — |
| R. Read-only prechecks | **done** 13 Nov, 12/12 PASS (previous report 02a) | — |
| C-prep. Stage C package (this report) | **ready**: script hardened and tested offline, instructions written, two independent review rounds (05) | — |
| **C. Owner runs the script in CloudShell (03)** | **next: owner action** | owner only; the key never leaves AWS |
| C-check. Labels and creation time by metadata (`DescribeSecret`), CloudTrail one `PutSecretValue` | after C, read-only, with the owner's go-ahead | Claude |
| P-5. Pin `<NEW_VERSION_ID>` in PR #121 (04), offline checks, CI, out of draft | after C-check | Claude prepares; merge under the owner's rules |
| D. At-rest plan and apply (6 declared changes), post-apply "No changes" | not started; clears S-1 | owner approval (dispatch, `aws-nonprod` environment) |
| E. Session: `up`, db-admin, migrate, Identity rollout, verification, `down`, DNS (owner, Cloudflare) | not started | separate owner approval |

## Carried-forward findings (unchanged by this task)

| Id | Finding | Severity | When it is cleared |
| --- | --- | --- | --- |
| S-1 | The scheduled Testing `down` fails at "Plan the switches" since platform#105 (the docs-migrate delta). Its database-stop step still works | Medium, operational | stage D applies the delta |
| S-2 | The RDS-managed master secret's rotation fails while PostgreSQL is stopped (leftover `AWSPENDING`, retried every 7 days) | Low | check its labels and the database together before stage E (db-admin reads that secret unpinned) |
| S-3 | The `*.test.munaxa.com` certificate is not renewed automatically while unused; valid until 22 May 2027 | Low | re-issue or attach it to a running session before April 2027 |
| Budget | The old $10 account-wide budget is at 96 % this month and will alert; the $50 budgets are the binding ones | Info | owner housekeeping; **not changed by this task** |

## New items from this task

See 05 for the review findings. The accepted Low and Informational items are listed there with their reasons. None blocks stage C.
