# Phase 6: next execution sequence

Date: 4 Nov 2026. Lead orchestrator. Labels: [V-repo], [V-gh], [V-aws], [E], [U], [O].

Phase 6 authorizes none of these steps. Each one carries the approval it needs. No later phase starts automatically.

| # | Step | Who | Approval | Stop condition |
| --- | --- | --- | --- | --- |
| 1 | The Phase 6 reports PR is merged to main. This puts `supporting/b2-owner-simulation.sh` (sha256 `b62dbbef…61002`) at the URL in runbook step 9 | Lead | Standing rule (docs only) | - |
| 2 | Tamer decides D-1 (re-apply at 46dfbd920c6ee7ac940f0b7ca05656aca461f777) and D-2 (residuals) | Owner | **Decision** | - |
| 3 | Root re-apply of `infra/aws/bootstrap` at 46dfbd9, following `01-IAM-BOOTSTRAP-SECURITY.md` §6 steps 0 to 8: Terraform 1.16.5 with a SHA256 check, a pinned clone, `init -reconfigure`, a state backup, a saved plan, an address diff, apply of the saved plan only, a post-apply no-change plan | Owner (root, CloudShell). Tamer pastes the outputs and the lead checks them | D-1 | The plan is anything other than `19 to add, 6 to change, 0 to destroy`; any address outside `supporting/expected-reapply-changes.txt`; any destroy or replace; any budget, ECR, KMS, S3, publisher or `ci["prod"]` change; drift; or the post-apply plan does not exit 0 |
| 4 | Same sitting: runbook step 9, the owner IAM simulation. 332 read-only calls, run only after the sha256 check | Owner (root, read only) | D-1 | The script exits other than 0, or `unexpected_mismatch` is not 0. Stop, and fix by PR; never edit the expected values |
| 5 | Same sitting: runbook step 10. Set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on the `aws-nonprod-session` environment to the session role ARNs. Keep the repository-level `AWS_CI_ROLE_ARN` | Owner (GitHub settings) | D-1 | The ARN lacks the `/munaxa-shared/bootstrap/` path |
| 6 | Lead publishes a dated re-apply report with [V-aws] evidence: the plan summary, outputs and simulation `RESULT` line | Lead | Standing rule | - |
| 7 | Fresh nonprod plan: dispatch `aws-terraform.yml` on `main` with `environment=nonprod` and `action=plan`. The owner approves the job in `aws-nonprod` | Lead dispatches, owner approves | Plan dispatch (read only) | The run was created before step 3 finished; the role ARNs lack the path; the head SHA is not the expected one; the result is anything other than `64 to add, 0 to change, 0 to destroy`; or the address table differs from `2026-11-04-phase5/supporting/g3-expected-addresses.txt` (`03-TERRAFORM-G3-RECONCILIATION.md` §6) |
| 8 | Code PR with the Phase 6 patches (D-3): apply-log suppression, P1 workflow hardening, p6-01, p6-02, P3, P4, the a6 stack validations, and a **regenerated** simulation script. It gets its own independent review | Lead | Standing merge rule covers code only. The bootstrap part needs a second re-apply approval | CI red; review blockers |
| 9 | Optional, before the first Testing session: second root re-apply with the patches, plus the regenerated simulation | Owner | **Separate approval** | As in steps 3 and 4, with the new expected list |
| 10 | G3 declaration PR: `infra/aws/stack/envs/nonprod.expected-changes.json` = the 64 creates (or 77 if D-4 is A) | Lead (code), owner approves | **G3 approval** | `check-plan-intent --validate` fails |
| 11 | G3 apply: dispatch `aws-terraform.yml` with nonprod `apply`. The plan job enforces the declaration. The owner approves in `aws-nonprod` | Lead and owner | **G3 approval** (not given) | Enforce mismatch, plan older than 4 h, or commit mismatch |
| 12 | Right after step 11: dispatch `aws-session.yml` `down`, then confirm the database is stopped. If D-4 is B, apply P2 in the same window | Lead | Part of G3 | The database is not stopped |
| 13 | Within 72 h of step 11: G6 Cloudflare DNS validation records | Owner | **G6 approval** | ACM gives up after 72 h |

Gate check (brief §6), as of the end of Phase 6:

| # | Gate | Status |
| --- | --- | --- |
| 1 | platform#38 merged | **Met** [V-gh]: 46dfbd9 |
| 2 | Owner approves the re-apply | **Not met** [O]: D-1 |
| 3 | Owner re-applies the bootstrap | **Not met** [O] |
| 4 | Owner simulation shows zero unexpected mismatches | **Not met** [O]. The script is ready; locally it matches 332 of 332 [V-repo, local only] |
| 5 | Residuals fixed or accepted | **Not met** [O]: D-2 |
| 6 | Fresh plan after the re-apply | **Not met**: step 7 |
| 7 | The plan matches the reconciled list | **Not met**. The list is reconciled: 64 creates [V-gh run 41887322394, V-repo] |
| 8 | G6 DNS ready within 72 h | **Not met** [O]: needs approval |
| 9 | Session role ARNs on the GitHub environment | **Not met** [O]: step 5 |
| 10 | Testing shutdown safeguards verified | **Not met**. P1 and P2 are only proposed; no scheduled run has ever acted [V-gh] |
| 11 | Product prerequisites and order resolved | **Partly met**. Open items in `05-CROSS-PRODUCT-READINESS.md`: valkey and postgres images, the Control licence-key order, `seed-work-roles`, `CONTROL_PLANE_TOKEN`, the Docs image |
| 12 | No production or destructive change in the plan | **Met** for run 41887322394 [V-gh]. Must be re-checked in step 7 |
