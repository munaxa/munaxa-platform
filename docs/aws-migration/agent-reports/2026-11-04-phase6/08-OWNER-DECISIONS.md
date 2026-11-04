# Phase 6: owner decisions

Date: 4 Nov 2026. Lead orchestrator. Labels: [V-repo] repository evidence, [V-gh] GitHub workflow evidence, [V-aws] live AWS evidence, [E] inferred or estimated, [U] not yet verified, [O] owner action required.

Only decisions that need Tamer are listed. Nothing here has been decided yet. Nothing in Phase 6 was applied to AWS.

## D-1. Approve the root re-apply of the shared bootstrap at 46dfbd9 [O]

- **What:** Tamer, as root in AWS CloudShell eu-central-1, follows `01-IAM-BOOTSTRAP-SECURITY.md` §6, pinned to `46dfbd920c6ee7ac940f0b7ca05656aca461f777` (platform#38) and nothing else.
- **Expected plan** [V-repo, reproduced offline by Agents 2, 4 and 7]: `Plan: 19 to add, 6 to change, 0 to destroy`. That is 4 real IAM updates, 2 deployer trust re-reads with the same content, and 1 move. Everything is IAM. Any budget, ECR, KMS, S3, publisher or `ci["prod"]` change is a stop.
- **Same sitting:**
  1. Run the 332-call owner simulation from `supporting/b2-owner-simulation.sh`, after its sha256 check. It must end with exit 0 and `unexpected_mismatch=0`.
  2. Set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on the `aws-nonprod-session` environment to the new session role ARNs.
  3. Keep the repository-level `AWS_CI_ROLE_ARN`, because the job-level `if` reads it.
- **Recommended:** approve.
- **If not decided:** B2/TD-14, H-1, H-2, H-2b and H-3 stay open in AWS. The deployer that runs in AWS today is the broader 1331ef8 one. G3 cannot proceed.

## D-2. Residual risks R1 to R20 (`07-RESIDUAL-RISK-REGISTER.md`) [O]

Rows marked "Required" need a decision: R1 to R10, R14, R15 and R18 to R20. For each one, Tamer either confirms the stated fact, accepts the risk in writing, or asks for the fix. Recommended:

| Risks | Recommended choice | Why |
| --- | --- | --- |
| R1, R2, R3, R5, R6 | Accept for Testing (nonprod). Before production, revisit them together with R15 | IAM cannot scope these actions. The account holds only Munaxa workloads in eu-central-1, apart from the out-of-scope project, which Phase 6 did not inspect. That last point is [U] |
| R4 | Accept for G3. Ask for the stack change (drop `aws_default_security_group.default`) before production | It is low to medium, and only untagged groups are affected |
| R7, R19, R20 | Accept for Testing, because the data there is test data. Require p6-02 plus the R19 guardrail patch before production. Separately decide on an IAM Access Analyzer (an AWS write) | This is the deployer's own environment only |
| R8, R18 | Accept for nonprod | Own environment only; there is no condition key to scope it |
| R9, R10 | Fix them through the second re-apply (P4, p6-01) before the first Testing session | They become reachable only once sessions run, and G3 starts none |
| R14 | See D-5 | |
| R15 | Defer: member accounts before production (an earlier decision of 29 Oct keeps root and one account until launch) | Architecture |

- **If not decided:** G3 apply stays blocked (gate 5).

## D-3. When to land the Phase 6 patches [O]

- **What:** the bootstrap patches p6-01, p6-02, P3 and P4, and the workflow and stack patches P1, P2 and `platform-a6-readiness-and-logs.patch`, all in `supporting/patches/`. They are tested offline only.
- **Constraint** [V-repo, review BL-1]: the patches flip 14 simulation cases. Merging them before D-1 would invalidate the 332-call script and the expected list.
- **Recommended:**
  1. D-1 first, at 46dfbd9.
  2. Then one code PR with all the patches and a regenerated simulation script, independently reviewed.
  3. Then a second bootstrap re-apply (separate approval), before G3 or at the latest before the first Testing session.
  4. The apply-log suppression in `aws-terraform.yml` must be on main before the G3 apply (review M-3).
- **If not decided:** R9, R10 and R11 to R13 stay open. G3 apply output would go to a public log.

## D-4. The AWS-side shutdown backstop (Agent 5 P2) [O]

- **What:** an EventBridge Scheduler job at 21:00 UTC stops the RDS instance and sets the ECS desired counts to 0. The estimated cost is about US$0.00 a month [E].
- **Choice A, include it in G3:** the G3 plan becomes 77 creates. The declaration and the reconciliation are redone.
- **Choice B, a separate small apply right after G3:** G3 stays the reconciled 64 creates.
- **Recommended:** B, with P1 (workflow hardening) merged before the first `up`.
- **If not decided:** the only stop is the GitHub cron. All 5 of its runs so far were `skipped`, and they started 3 h 12 min to 6 h 05 min late [V-gh]. A forgotten session costs about US$7.30 a day [E].

## D-5. Repository protection before image publication (G5) [O]

- **What** (`05b-REPOSITORY-PROTECTION.md`):
  - main and `image/*` tag rulesets in identity, control, work and school;
  - a required reviewer on `image-release`;
  - make the AWS Terraform check required in platform; this needs the PR `paths:` filter removed, which is in the a6 patch.
- **Required approvals on platform main:** all agents act as `tam2om`, so a "1 approval" rule only works once agents use a separate bot identity.
- **Recommended:** add the tag and main rulesets now (a GitHub settings change, by the owner). Decide the bot identity before G5.
- **If not decided:** an unreviewed merge to main reaches the session deployer (R14). Tags can publish images without review.

## Carried over (not new)

- **About 4 Dec 2026:** delete the Docs final snapshot, or cancel its key deletion (Phase 5 B-8).
- **TD-13:** the US$10 `munaxa-account-monthly` budget will alert every month after G3 (Phase 5 B-9).
- **G6 DNS validation within 72 h of G3:** this needs approval, and is planned together with the G3 approval.
