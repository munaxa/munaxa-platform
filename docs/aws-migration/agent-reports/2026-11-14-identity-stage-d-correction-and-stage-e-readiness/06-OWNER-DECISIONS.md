# 06. Owner decisions

Nothing here is authorized by this report. Each item is a separate yes/no for the owner. Stage E itself is **not** requested now.

## Needed before stage E can be requested

| # | Decision | Options | Recommendation | Why |
| --- | --- | --- | --- | --- |
| D-E0 | Sign in to the AWS connector again so this thread's calls work (V-1) | owner action, not a choice | do it, then send any message | the 14 Nov read-only verification (02) could not run; every stage E connector step depends on it |
| D-E1 | Merge PR #128 (corrected stage D report) and this report's PR | yes / not yet | yes, after review | documentation only; the corrected status is the record ChatGPT reviews |
| D-E2 | Independent cleanup before the first session (BE-2) | (a) build PR #90 revision 2 first (Stage B approvals B-1 to B-4: one plan/apply adding the state machine, schedules and alarm); (b) proceed without it and accept that, if Claude loses control and every scheduled `down` fails, the ALB keeps costing about US$0.89 a day until someone runs `down` | **(a)** | it is the owner's own position of 11 Nov 10:30 UTC; (b) reverses it |
| D-E3 | Verification route (BE-3) | (a) the probe: Claude opens the pin PR (`identity_probe_source`), then one owner-approved plan/apply with exactly 1 create; (b) runbook 03 §12–§14 checks run by a new throwaway-account helper; (c) both | **(c)**: the probe covers health, sign-in, JWT, logout, refresh replay and host rules; the helper covers MFA, recovery codes and lockout, which the probe does not | each covers what the other cannot |
| D-E4 | Operator sign-in route (BE-4) | (a) owner types the password once at a hidden CloudShell prompt during the session; (b) skip the operator sign-in, use only the throwaway account for sign-in checks; (c) `asm-exec`, only if a read-only check shows it exists | **(b)** for the first session | no credential handling by anyone; the probe (D-E3) already proves the operator account can sign in without Claude seeing the password |
| D-E5 | Leftover throwaway `@example.invalid` account in the Testing database after the session (BE-6) | accept / require a reviewed disable step | accept for Testing | Testing data only; no deliverable address |
| D-E6 | Repository tasks to unblock E (BE-1, BE-3, BE-8) | yes / no | yes: one reconciled stage E runbook naming revision 2; the throwaway-account helper; sandbox-compatible Option A scripts; all reviewed, documentation and code only | no AWS change; each lands as its own reviewed PR |

## Not blocking stage E

| # | Decision | Recommendation |
| --- | --- | --- |
| D-N1 | B-1: the US$10 account budget is alert-only and exceeded every month | keep it as an early warning, or retire it; the US$50 budgets are binding |
| D-N2 | S-2: RDS master-secret rotation fails hourly while the database is stopped | review the Testing rotation period later; check the secret's stages on session day |
| D-N3 | S-3: the `*.test.munaxa.com` certificate is not auto-renewable while unused | use it in a session or re-request before about April 2027 |
| D-N4 | docs-migrate secret value | write it only before the first docs-db-admin run (CONTRACT); not needed for Identity |

## Then, later

| # | Decision |
| --- | --- |
| D-E7 | **Stage E approval**, after D-E2 to D-E6 are done. It must name: the date and a start by 15:30 UTC; the `up` dispatch and its gate (which also starts the database); every mutating connector call (RunTask db-admin:2, migrate:2, bootstrap:2 ×3, the probe, `UpdateService --force-new-deployment`, C-8 and C-16); the owner's DNS step; the hard stop at T0 + 3 h; the cost statement; the `down` dispatch |
