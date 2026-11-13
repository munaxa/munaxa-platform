# 03. Risk register

Read-only AWS checks at 20:15 UTC, 13 Nov 2026 [V], unless marked.

| Id | Risk | Evidence now | Status | Recommended mitigation (not implemented) |
| --- | --- | --- | --- | --- |
| S-1 | Scheduled Testing `down` fails at "Plan the switches" because the docs-migrate delta is pending | runs 43186450457, 43337833043, 43396042072 failed that way; the database stop job succeeded each time | **Open — non-blocking** | stage D's apply clears it. After the merge and before the apply the plan holds 6 changes, so `down` keeps failing the same safe way (F12) |
| S-2 | RDS-managed master secret rotation fails while the database is stopped | `RotationFailed` hourly 13:08–16:25 UTC; after the auto-start, `RotationSucceeded` and "Reset master credentials" at 17:26; next rotation 20 Nov | **Open — non-blocking** | none for stage D (db-admin reads the master secret by label, unpinned). Consider a longer rotation period for Testing later |
| S-3 | Test certificate not auto-renewable while unused | `*.test.munaxa.com` ISSUED, not after 2027-05-22, renewal INELIGIBLE, in use by nothing | **Open — non-blocking** | have it attached to the ALB by a session before about April 2027, or re-request it |
| B-1 | Account-wide US$10 budget | `munaxa-account-monthly` actual US$9.67 on 13 Nov, 80 % alert in ALARM; run rate about US$0.75 a day, so about US$22 for November | **Open — non-blocking** | owner: keep as an early-warning only, or retire it in favour of the binding US$50 budgets. No budget actions exist, so nothing is blocked automatically |
| B-2 | Binding US$50 Testing budget | `munaxa-shared-testing-monthly` US$1.99; `munaxa-shared-account-monthly` US$9.67 of 50 | **Resolved** for stage D | stage D's apply adds no running cost |
| N-1 | The Testing database restarted itself at 16:26 UTC (7-day stopped limit) and was running at 20:15 UTC | RDS events; status `available`; backstop `munaxa-nonprod-backstop-database` ENABLED, `cron(0 21 * * ? *)` UTC, target `rds:stopDBInstance` | **Requires verification** after 21:00 UTC | expected design behaviour. Confirm the stop after 21:00. The 7-day clock means it will restart again around 20 Nov |
| N-2 | Stage D apply rollback | task definitions are replaced with `skip_destroy`, so revision 1 of each stays registered; nothing runs | **Open — non-blocking** | rollback = revert #121 and apply, or point a session at revision 1; no data change |
| N-3 | Plan staleness | an approved apply must use a plan at most 4 h old from the same commit | **Open — non-blocking** | dispatch the apply soon after the plan review |
| N-4 | `secret_version_ids` lacks validation (F8) | variables.tf:330-334 | **Open — non-blocking** | follow-up PR |
| L-1 | root, not least privilege | 8 Nov access policy | accepted | unchanged |

No risk is blocking stage D.
