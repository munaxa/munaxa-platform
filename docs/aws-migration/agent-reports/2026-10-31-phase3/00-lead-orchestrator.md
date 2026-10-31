# 00 · Lead orchestrator: phase 3, pre-G2 verification and bootstrap preparation, 31 Oct 2026

- **Brief:** "Munaxa AWS Migration — Phase 3: Pre-G2 Verification and Bootstrap Preparation"
  (Tamer, 04:17 UTC, 31 Oct).
- **Baseline:** [`../2026-10-30-phase2/`](../2026-10-30-phase2/), read in full (00, MASTER, NEXT,
  SECURITY, COST, DOCS-REPLACEMENT, CROSS-REPOSITORY, DECISIONS, and 01 to 07).
- **Method:** one lead session, no subagents. Labels in every file: **[V]** verified, **[E]**
  estimated, **[R]** recommended, **[U]** unverified, **[O]** owner action required.

## 1. What this phase did

| Area | Result | Detail |
| --- | --- | --- |
| Merged state (brief §4) | All phase 2 merges confirmed on GitHub; every named fix found in the code [V]. Six discrepancies with the phase 2 reports, none blocking (main CI red on a timing test at `c41f08d`; README resource count 46 vs 49; others) | MASTER, DECISIONS §2 |
| AWS root access (§5A) | Connector needs a new sign-in, and is root when signed in. **No AWS call made.** No non-root identity exists under the 29 Oct decision; what one would need is documented | SECURITY §1 |
| OIDC subjects P11 (§5B) | **Verified** from tokens GitHub issued to all five repositories, by a temporary probe that made no AWS call and was removed | SECURITY §2 |
| Old Docs protection P9 (§5C) | Verified in code (name, `Project = MunaxaDocs`); live tags unverified (no AWS access) | SECURITY §3, §4 |
| Other findings (§5D) | Sorted into before G2 / before G3 / Testing / Production. N-2 fixed in code with a project-neutral deny (platform#31) | SECURITY §3 |
| Bootstrap review (§6) | fmt, validate, 4 + 14 mocked tests, mutation check; IAM, OIDC, state, locking, KMS, ECR, budgets, outputs, workflow references reviewed | G2-BOOTSTRAP-READINESS §1, §2 |
| G2 preparation (§6) | Checklist with exact commands, 49 expected resources, roles and policies, state changes, cost (≈ US$1 to 2.30 a month), rollback, success criteria | G2-BOOTSTRAP-READINESS §3 to §9 |
| PRs (§7) | **platform#31** opened, all checks green, merged → `fc87e94`. The reports PR (this directory) by the same rule | MASTER |

## 2. Changes merged

- platform#31 → `fc87e94` (squash, head `8be36c4` pinned): `NeverAnotherProjectByTag` and
  `NeverTagForAnotherProject` on both deployers; bootstrap test for them and for the resource counts;
  README G2: 49 resources, environments before variables.
- The reports PR (this directory).

## 3. Decision

# **READY FOR G2 APPROVAL**

Every pre-G2 item is resolved and verified, or is a step of the owner's own G2 run (the read-only
pre-checks in CloudShell). No blocker stops G2. Items that block **later** gates are in
DECISIONS-AND-BLOCKERS §4 (B2, the untagged-resource residual, blocks **G3**).

**Exact G2 sequence (do not run before approving; full commands and expectations in
[G2-BOOTSTRAP-READINESS.md](G2-BOOTSTRAP-READINESS.md) §3):**

1. CloudShell as root, eu-central-1: `git clone https://github.com/munaxa/munaxa-platform.git`,
   `git checkout` the reports PR's merge commit or `fc87e94`, `cd infra/aws/bootstrap`, Terraform 1.16.5.
2. Read-only pre-checks: account `229251310592`; no `/munaxa-shared/` roles or policies; no state
   bucket, alias, product ECR repositories or `munaxa-shared*` budgets; the GitHub OIDC provider exists.
3. `mv backend.tf backend.tf.off && terraform init -input=false && terraform plan -input=false -out=g2.tfplan`;
   `terraform show -json g2.tfplan | jq …` must show exactly `{"create":49}`.
4. `terraform apply g2.tfplan`; `mv backend.tf.off backend.tf && terraform init -migrate-state -input=false`;
   `terraform plan -detailed-exitcode` exits 0.
5. Verify: bucket versioning, public-access block, encryption, the CI trust subjects, 11 ECR
   repositories, two `munaxa-shared*` budgets, and `simulate-principal-policy` returning
   `explicitDeny` for `Project = MunaxaDocs`, `Project = other` and `Environment = prod`.
6. Billing: activate `Environment` and `Project` cost allocation tags.
7. GitHub: create the environments first (`aws-nonprod`, `aws-prod` with reviewer and `main` only;
   `aws-nonprod-session` `main` only; `image-release` per product repository), then the role variables.
8. Sign the AWS connector out. Stop: the lead's next step is a read-only nonprod plan; G3 is separate.

## 4. Confirmations

- **No AWS infrastructure changes were made.** No AWS API call was made at all in this phase (the
  one attempt was refused for sign-in before reaching AWS).
- **No production changes were made.**
- **Old Docs infrastructure remains untouched.**
- **No images were published and no services were deployed.** No remote database migration ran.
- **No CanteenHub resource, repository or configuration was accessed or modified**, and no attempt
  was made to determine where it is hosted.
- No Terraform apply, no KMS key or secret, no GitHub environment or variable, no Cloudflare,
  Render or Supabase change, no G9 action.

## 5. Files

[MASTER-EXECUTION-STATUS](MASTER-EXECUTION-STATUS.md) ·
[NEXT-EXECUTION-PLAN](NEXT-EXECUTION-PLAN.md) ·
[SECURITY-FINDINGS-AND-REMEDIATION](SECURITY-FINDINGS-AND-REMEDIATION.md) ·
[G2-BOOTSTRAP-READINESS](G2-BOOTSTRAP-READINESS.md) ·
[COST-AND-TRANSITION-ANALYSIS](COST-AND-TRANSITION-ANALYSIS.md) ·
[CROSS-REPOSITORY-DEPENDENCIES](CROSS-REPOSITORY-DEPENDENCIES.md) ·
[DECISIONS-AND-BLOCKERS](DECISIONS-AND-BLOCKERS.md)
