# 00. Executive summary: Testing readiness, Session 1 executed (repository side)

**Date:** 21 Nov 2026 (owner brief 16:14 UTC, thread "Prepare Docs Testing deployment session 1").
**Scope:** repository work, offline tests and offline Terraform only. Release order Identity →
Control → Docs; Docs is the first customer-facing product in Testing.

| Question | Answer |
| --- | --- |
| Is Session 1 repository preparation done? | **Yes**, except what needs AWS or the owner (file 08). Every Session 1 item of the pack now has a reviewed, tested repository artefact and exact owner commands |
| Owner decisions D-IAM-1 and D-OP-1 | Recorded as decided (file 01). D-IAM-1 is **implemented with a correction**: the 29 Oct `MunaxaEngineering` draft is unsafe in the management account (finding IC-1, High) and is replaced by a tested management-account policy with no IAM write. D-OP-1 is a pending Terraform value for Apply 1 (not changed on `main` now, on purpose: file 01 §2) |
| IAM Identity Center | Ready for the owner: `infra/aws/identity-center/` (three policies, 13 offline tests, console steps, verification and negative tests, rollback). Nothing created in AWS |
| Control and Docs secret custody scripts | Reviewed: values never printed, `status` is metadata only, `bundles` is resumable and never overwrites. **Changed:** every script now accepts only root or a `MunaxaEngineering` Identity Center session, and hides the session (user) name. 64 tests pass (61 before + 3 new). New SHA-256 values in file 03 |
| Docs ECR bootstrap | **The pack's declaration was incomplete.** An offline Terraform plan of the last applied code (a04723a) against `main` gives **2 add, 3 change, 0 destroy** (publisher role policy, publisher boundary **and** workload boundary), not "one policy update". Each change only adds the `munaxa-docs/migrate` ARN. A guarded owner plan script now refuses anything else. Runs as **root**, not Engineering (file 04) |
| OpenSSL (D-SSL) | **Still blocked.** pkgs.alpinelinux.org at ~16:16 to 16:40 UTC: edge `libssl3` 3.5.9-r1; v3.22, v3.23 3.5.9-r0; v3.24 (the images' branch) 3.5.9-r0/3.5.9-r1. No 3.5.10 anywhere. Bump PRs identity#24, control#13, docs#182, work#35 checked: pins correct, all affected stages covered, gate unchanged (file 05) |
| PRs merged by this task | This report's PR only (file 06). **No other open PR is eligible**: every one is blocked by the D-SSL image scan, is a draft waiting for Alpine, or waits on an owner grant |
| Terraform applied? | **No.** Offline plans only |
| AWS resources created or changed? | **None.** One read-only connector call was attempted and refused before reaching AWS (connector sign-in expired); no AWS call was made |
| Images published, services started, DNS, secrets, GitHub settings changed? | **No, none** |
| Docs Testing runbook | Complete for Session 2 (file 07): merges, scans, SHAs, publish, Apply 1 (C-1 + Identity pin + MFA), Apply 2 (C-2 + D-1), `OPERATOR_CIDRS`, Control session, credential, Docs pin, Docs session (db-admin, migrations, first admin, services, health, login, Identity sign-in, licensing, S3), shutdown and cleanup |

## Plain-language owner questions (yes/no)

1. **Set up your AWS sign-in (IAM Identity Center) with the corrected Engineering role** from
   `infra/aws/identity-center/` instead of the 29 Oct draft? Recommended: **yes**. About 30
   minutes in the console, no cost, root keeps working throughout.
2. **Run the Docs bootstrap plan script as root** (it only plans and stops on anything other than
   the reviewed 2-add, 3-change change), then send Claude the log? Recommended: **yes**. Applying it
   is a separate yes afterwards.
3. **Fill the Control and Docs secret bundles** with the reviewed scripts (Docs mail as a
   placeholder for the first run)? Recommended: **yes**, after question 1 (or as root now).

## Files

| File | Content |
| --- | --- |
| [01-OWNER-DECISIONS.md](01-OWNER-DECISIONS.md) | D-IAM-1, D-OP-1 and the defaults this task applied |
| [02-IAM-IDENTITY-CENTER-READINESS.md](02-IAM-IDENTITY-CENTER-READINESS.md) | Findings IC-1 to IC-4, the new policies, MFA, connector, ECS Exec/SSM, GitHub OIDC |
| [03-CONTROL-AND-DOCS-SECRETS-READINESS.md](03-CONTROL-AND-DOCS-SECRETS-READINESS.md) | Script review, the change, hashes, owner commands, Resend |
| [04-DOCS-ECR-AND-TERRAFORM-READINESS.md](04-DOCS-ECR-AND-TERRAFORM-READINESS.md) | Offline delta, corrected declaration, owner plan script, RDS restart stop, cost |
| [05-OPENSSL-AND-IMAGE-SECURITY.md](05-OPENSSL-AND-IMAGE-SECURITY.md) | Upstream status, bump PRs, what happens when 3.5.10 lands |
| [06-PR-AND-CI-STATUS.md](06-PR-AND-CI-STATUS.md) | Every open PR, head SHA, blocker; tests run |
| [07-TESTING-DEPLOYMENT-RUNBOOK.md](07-TESTING-DEPLOYMENT-RUNBOOK.md) | Session 2, step by step |
| [08-OWNER-ACTIONS.md](08-OWNER-ACTIONS.md) | Owner actions in priority order with commands |
| [09-REMAINING-BLOCKERS.md](09-REMAINING-BLOCKERS.md) | Blockers in priority order |
| `supporting/` | Offline Terraform delta test and output, policy evidence, the owner plan script |
