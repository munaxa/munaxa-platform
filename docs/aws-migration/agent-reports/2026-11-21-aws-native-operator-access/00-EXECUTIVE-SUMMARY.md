# 00. Executive summary: AWS-native operator access

**Date:** 21 Nov 2026 (brief 15:14 UTC). **Scope:** repository only.

| Question | Answer |
| --- | --- |
| Cloudflare Access removed as a mandatory dependency? | **Yes.** Control's code, Terraform, the session workflow, the docs and the owner pack no longer require it. It stays supported as an **optional** extra layer. The Control code change (control#14) is on its PR, blocked from merging only by D-SSL; it must merge before Control's images are built, which D-SSL blocks anyway |
| AWS-native operator access design | **IAM Identity Center** (organization instance, `eu-central-1`; named users; MFA at every sign-in; `MunaxaAdministrator` / `MunaxaEngineering` / `MunaxaReadOnly`; Claude connector on ReadOnly); root break-glass only; GitHub OIDC for machines; one-off ECS tasks for private administration (no bastion, no VPN, ECS Exec off); CloudWatch; Secrets Manager. Control's operator console: ALB source ranges from the `OPERATOR_CIDRS` GitHub environment variable plus Munaxa Identity MFA and the subject allow-list. `infra/aws/OPERATOR-ACCESS.md` |
| Munaxa application authentication separate? | **Yes.** Munaxa Identity stays the application sign-in; Identity Center is AWS-only and never signs anyone in to a Munaxa product |
| Repositories changed | munaxa-platform, munaxa-control, munaxa-identity. Docs, Work, School: no change needed (no Access dependency) |
| PRs created / merged | platform#154 (code, docs, this report): merged by this task once green. control#14: **open, blocked on D-SSL** (required image scan). identity#25: **merged** `d6225ff` |
| Tests | Terraform 93/93 (mocked); workflow tests 21/21; Control 47 local + full CI suite green; all platform CI checks green. Only failures: image scans on D-SSL (file 04) |
| Remaining blockers | D-SSL (Alpine still at OpenSSL 3.5.9); owner setup of Identity Center (O-IAM-1 to 6) and decisions D-IAM-1, D-OP-1; `OPERATOR_CIDRS` before the Control session; the sprint's other owner items (file 06) |
| AWS resources changed? | **No.** No AWS call of any kind was made by this task |
| Images published? | **No** |
| Services started? | **No** |
| DNS or Cloudflare changed? | **No** |

## Files

1. [01-ARCHITECTURE-DECISION.md](01-ARCHITECTURE-DECISION.md): the model, why, endpoint review, decisions
2. [02-REPOSITORY-CHANGES.md](02-REPOSITORY-CHANGES.md): every change, and the classification of every reference
3. [03-SECURITY-AND-ACCESS.md](03-SECURITY-AND-ACCESS.md): controls before and after, gaps, gates kept
4. [04-TESTS-AND-CI.md](04-TESTS-AND-CI.md): local and CI results, D-SSL re-check
5. [05-UPDATED-OWNER-EXECUTION-PACK.md](05-UPDATED-OWNER-EXECUTION-PACK.md): **supersedes** the sprint pack; item 2 is now Identity Center
6. [06-REMAINING-BLOCKERS.md](06-REMAINING-BLOCKERS.md): blockers and next deployment-ready steps

## Owner yes/no questions (plain language)

1. **Set up AWS sign-in through IAM Identity Center now** (your own named login with MFA; Claude's
   AWS connector moved to read-only)? Recommended: yes. It is item 2 of the pack, costs nothing,
   and replaces the Cloudflare Access step.
2. **Give your login the Administrator, Engineering and ReadOnly roles in the one AWS account the
   workloads use today** (D-IAM-1)? Recommended: yes.
3. **Turn on Identity's two-step sign-in requirement for Control operators in Testing** (D-OP-1,
   applied together with the Identity image update in item 8)? Recommended: yes; Control will not
   start without Cloudflare Access unless this is on.
