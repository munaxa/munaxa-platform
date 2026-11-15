# 01. Owner decisions of 15 Nov 2026 and what was done with each

Source: the owner's instruction of 15 Nov 2026, 08:39 UTC ("Execute Approved PR #130 Decisions,
Resolve L-A0 Safely, and Prepare Identity Stage E"). It answers the decisions listed in
[`../2026-11-14-identity-stage-e-blockers-remediation/08-REMAINING-BLOCKERS-AND-OWNER-DECISIONS.md`](../2026-11-14-identity-stage-e-blockers-remediation/08-REMAINING-BLOCKERS-AND-OWNER-DECISIONS.md).

None of these decisions authorizes an AWS execution. Every apply, run or subscription below still
needs its own owner approval after the owner has seen the exact plan or procedure.

| Decision | Owner answer | What this task did | Still needed before AWS |
| --- | --- | --- | --- |
| D-BE4 | YES: skip the operator sign-in; the probe uses a throwaway account per run, disabled afterwards | Recorded. The probe pin (D-PIN) keeps throwaway mode (`identity_probe_account` default). Operator mode stays inert and is not pointed at the operator secret (PR #131, `identity-probe.tf` comment and test). | Nothing extra; it applies inside Stage E |
| D-PR | YES: merge PR #130 after verification | All checks in file 02 passed; **PR #130 squash-merged, merge commit `2f6d44317b921d4cf59649285f2481c8bef9fdb0`** | Done |
| D-B2 | YES in principle (bootstrap cleanup permissions); apply only after the exact plan is inspected | Plan content verified offline (2 updates, 2 creates, bootstrap tests 14/14). Root CloudShell procedure in file 06 §3. **Not applied.** | Owner runs the plan in CloudShell, Claude checks the counts, owner approves the apply |
| D-B3 | YES in principle (stack cleanup); apply only after plan inspection | Configuration PR **#132 (draft)** sets `session_cleanup_enabled = true` and declares the changes. Offline mocked plan: 8 creates, 1 update. **Not planned against AWS, not applied.** | D-B2 applied first; then merge #132, plan, plan review, apply approval |
| D-B4 | YES: dry runs of the idle and the active-session paths | Two procedures with `{"dryRun": true}` written (file 06 §4, §5). **Not run.** | D-B3 applied; owner approves each run |
| D-B5 | YES: use an owner-controlled address already in approved configuration | Address chosen from approved configuration: `alert@munaxa.com` (bootstrap `budget_alert_emails`, already used by the applied budgets). Procedure in file 06 §6. **Not subscribed.** | D-B3 applied; owner approves the subscribe; owner clicks the confirmation email |
| D-PIN | YES: prepare the probe pin and its plan; apply only after plan inspection | PR **#132** pins `identity_probe_source` to `2f6d443` and SHA-256 `7254a0ba…e369`; the manifest and E-1 carry the same pin. Offline mocked plan: 1 create. **Not applied.** | Same plan and approval as D-B3 (one configuration PR) |
| D-LA0 | NO to the CreateSecret canary; YES to a redesign in which the connector never handles the password | Canary dropped. **PR #131 (draft, unmerged):** the password is generated inside Secrets Manager by CloudFormation `GenerateSecretString`; C-8, C-8R, C-8v and C-16 deleted; new C-8G script never sends or receives a password. Files 03 and 07. | Separate independent review of #131, owner merge approval, then (in Stage E) owner approval for C-8G `create` |
| D-E | NO: Stage E not authorized | Nothing of Stage E started | A new, separate owner decision |

## Order of the remaining gates

1. Review and merge decision on PR #131 (L-A0). If #131 merges first, PR #132's declaration must
   be extended by the two bootstrap changes (file 09 §2).
2. D-B2 bootstrap plan, inspection, apply (root, CloudShell).
3. PR #132 merge, nonprod plan through `aws-terraform.yml`, plan inspection, apply (D-B3 and D-PIN).
4. D-B5 subscription, owner confirms the email.
5. D-B4 idle dry run, then one real scheduled run of R (21:05 UTC) must succeed before any `up`.
6. D-B4 active-session dry run happens inside the first session window, which is Stage E (D-E).
