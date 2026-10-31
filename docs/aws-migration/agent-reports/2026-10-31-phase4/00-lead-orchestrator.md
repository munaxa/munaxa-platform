# 00 · Lead orchestrator: phase 4, G2 bootstrap execution, 31 Oct 2026

- **Brief:** "Munaxa AWS Migration — Phase 4: Execute G2 Bootstrap" (Tamer, 05:46 UTC, 31 Oct).
  Authorises G2 only.
- **Baseline:** [`../2026-10-31-phase3/`](../2026-10-31-phase3/), all eight files read in full;
  `infra/aws/bootstrap` at `351352a` (= `fc87e94` + phase 3 reports, docs only).
- **Method:** one lead session, no subagents. G2 ran as **root in AWS CloudShell**, in Tamer's
  browser. The lead sent one stage at a time, Tamer pasted the output, and the lead checked it
  against the runbook and the brief's stop conditions before sending the next stage. The AWS
  connector stayed signed out and was not used.
- Labels in every file: **[V]** verified, **[E]** estimated, **[R]** recommended, **[U]** unverified,
  **[O]** owner action required.

## 1. Outcome

# **G2 SUCCEEDED (AWS side complete); GitHub owner actions pending**

| Item | Result |
| --- | --- |
| Account / region | `229251310592` / `eu-central-1` [V] |
| Resources created | **49** (`Apply complete! Resources: 49 added, 0 changed, 0 destroyed`, 12:45:18 UTC) [V] |
| In-place fix | platform#33 (`1331ef8`) re-applied 13:42:03 UTC: **0 added, 2 changed, 0 destroyed** (the two deployer inline policies) [V] |
| Terraform state | In `s3://munaxa-shared-tfstate-229251310592/bootstrap/terraform.tfstate`, versioned, SSE-KMS; plan against it: **No changes** [V]. Local copies removed after that [V] |
| Verification | Bucket, KMS, trusts, deny statements, 11 ECR repositories, 2 budgets: all as the runbook expects [V]. Simulations: as intended **after** the fix (7/7) [V] |
| Cost allocation tags | `Environment` and `Project` **Active** (13:43:41 UTC) [V] |
| GitHub environments and variables | **Pending, owner** [O]: this session cannot create or read them (MASTER §4) |
| G3 and later | **Not executed** |

## 2. Stops and deviations (each handled within the brief)

1. **Plan summary `{"create":49,"read":4}`** instead of `{"create":49}`. The four reads are local
   policy-document data sources deferred to apply time; all 49 resource addresses matched the
   inventory exactly, with no update, delete or replace. Stopped; **Tamer approved** the apply
   (12:43). [V]
2. **CloudShell home full** (1 GB volume, 100 %, mostly `~/bootstrap`, 790 MB, which looks like the
   old Docs bootstrap working directory; not touched). Work moved to `/tmp/g2`. [V]
3. **CloudShell restarted between apply and `-migrate-state`**, clearing `/tmp`. Recovered from the
   `cmp`-verified home-directory backup; the restored state planned **No changes** before migration. [V]
4. **Simulation 3 (`Project=munaxa, Environment=nonprod`) returned `explicitDeny`**, runbook
   expected `allowed`. Stopped. Root cause: platform#31's N-2 denies used `StringNotEquals`, which is
   true when the tag key is missing, so the deployer was denied every untagged request (fail-closed,
   no exposure; it would have blocked the first nonprod plan). Fixed in **platform#33** (merged
   `1331ef8`, standing rule), re-applied with **Tamer's approval** (13:29), re-verified. [V]

## 3. Confirmations

- **G3 was not executed.** No VPC, RDS, ECS cluster, ALB, application secret, service or deployment
  was created. No image was published. No remote database migration ran.
- **No production change.** The prod CI and deployer roles exist (part of the 49) but nothing can
  assume them until the `aws-prod` environment and its variables exist.
- **Old Docs Production untouched.** Neither plan nor apply addressed a Docs resource; the Docs
  budgets, OIDC provider (read only) and Docs state are unchanged; the deployers deny Docs by name
  and by `Project = MunaxaDocs` (simulation 1, explicitDeny). `~/bootstrap` in CloudShell was not
  touched.
- **CanteenHub was not accessed, inspected, searched for or modified.** No command listed
  account-wide resources beyond the runbook's prefix-filtered checks; the CloudTrail check was
  skipped for that reason (G2-EXECUTION-REPORT §6).
- No IAM user, access key, Identity Center change or new credential arrangement; no credential left
  CloudShell or entered a chat, file or report. No Cloudflare, DNS, Render or Supabase change.

## 4. Files

[MASTER-EXECUTION-STATUS](MASTER-EXECUTION-STATUS.md) ·
[G2-EXECUTION-REPORT](G2-EXECUTION-REPORT.md) ·
[SECURITY-VERIFICATION](SECURITY-VERIFICATION.md) ·
[COST-AND-TRANSITION-ANALYSIS](COST-AND-TRANSITION-ANALYSIS.md) ·
[NEXT-EXECUTION-PLAN](NEXT-EXECUTION-PLAN.md) ·
[DECISIONS-AND-BLOCKERS](DECISIONS-AND-BLOCKERS.md)
