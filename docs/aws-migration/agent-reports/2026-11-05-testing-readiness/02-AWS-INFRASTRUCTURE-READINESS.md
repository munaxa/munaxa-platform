# AWS infrastructure readiness and status reconciliation

- **Date:** 5 Nov 2026, evening (UTC).
- **Author:** the lead of this thread.
- **Scope:** read-only. No AWS call was made in this task (the root-signed AWS connector was not used), no Terraform was run, no secret, DNS, Cloudflare or GitHub setting was read or changed. CanteenHub was not inspected.
- **Sources:** git (`munaxa-platform` main `016f3f5` and branch commits), GitHub Actions run and job metadata, and the earlier dated reports in this folder. Where a fact rests on an earlier report, the report is named; where that report rests on owner-pasted AWS output, it is labelled so.

## Evidence labels

| Label | Meaning |
| --- | --- |
| [V-gh] | GitHub API (run, job, PR, tag metadata), read in this task |
| [V-repo] | git content, read in this task |
| [V-aws-prior] | AWS output read by an earlier thread (owner-pasted or owner-approved read-only reads), as recorded in a named report on main; not re-read in this task |
| [O-rep] | owner's statement, without output |
| [E] | inference |
| [U] | unknown: no current evidence |

**Rule applied:** a resource is never treated as existing because Terraform code defines it.

## 1. Status reconciliation

`infra/aws/README.md` line 9 says "**Status: not applied.** Nothing in this directory has created an AWS resource". `infra/aws/CONTRACT.md` line 7 says "Status: 30 Oct 2026. Nothing in it is applied." **Both are out of date for `bootstrap/` and still correct for `stack/`.** The corrected wording is in §5 and in this folder's PR.

| Question | Answer | Evidence |
| --- | --- | --- |
| Account and Region in use | Account `229251310592`, Region `eu-central-1` (IAM and Budgets events recorded in us-east-1, as global services) | [V-repo] `bootstrap/variables.tf`, `stack/envs/nonprod.tfvars`, every publish workflow `REGISTRY`; [V-aws-prior] `2026-11-05-evidence-recovery/00` §9 (`sts:GetCallerIdentity`, CloudTrail) |
| Does the shared bootstrap exist? | **Yes.** G2 applied 31 Oct (49 created: state bucket, state KMS key, 11 ECR repositories, workload boundary, CI and deployer roles per environment, 4 image publishers, 2 budgets). Re-applied 5 Nov 05:1x at `46dfbd9` (19 added, 4 changed) and 5 Nov 09:55 at `6b8997a` (0 added, 5 changed). Latest state: serial 4, **68 managed instances** | [V-aws-prior] `2026-10-31-phase4/00` (owner-pasted apply output); `2026-11-05-bootstrap-reapply/00` (owner-pasted); `2026-11-05-evidence-recovery/00` §9 (connector read-only reads: CloudTrail, S3 state versions, IAM documents) |
| Which bootstrap changes are verified? | G2 (49) and first re-apply (19/4/0): owner-pasted apply and post-apply plan output. Second re-apply: **PARTIALLY VERIFIED** (effect, serial, counts, 6 roles' attachments and 14 documents verified; plan text and post-apply plan unrecoverable; 4 publisher roles and role trust policies not read) | as above; evidence-recovery `00` §1 |
| Has the shared `stack/` ever been applied? | **No evidence that it has; strong evidence that it has not.** All 4 `aws-terraform.yml` `workflow_dispatch` runs are plans: 41820815532 and 41865393534 failed at init, 41887322394 and 41977870108 planned **64 creates** (a plan of 64 creates means no stack resource was in state). In 41977870108 the "Apply" job was **skipped** [V-gh]. The nightly `aws-session.yml` run 41943924455 (5 Nov 00:47) ended green through the "state key not found" path [V-repo reports] | [V-gh] run list (4 dispatches, all on `main`), job list of 41977870108; `2026-11-05-bootstrap-reapply/00`; `2026-11-04-phase5/` |
| Has G3 been applied? | **No.** Same evidence. G3 is not authorized | as above |
| Do any Testing resources exist? | **No Terraform-managed Testing (`nonprod` stack) resource is evidenced.** Untracked console-made resources cannot be excluded without an AWS read [U]. The bootstrap's nonprod CI, deployer and session roles exist (they are bootstrap, not Testing workload) | as above |
| Is the old Docs stack retired? | **Yes, the eu-prod service, data and core roots were emptied.** Final data apply run 41797685617 (munaxa-docs, 4 Nov 08:21 UTC): plan, intent check and "terraform apply (the reviewed saved plan)" all **success** [V-gh]. Kept: the Docs bootstrap (state bucket, OIDC provider, `munaxa-docs/*` ECR, publisher role, budgets) [U, not re-read] and the final snapshot `munaxa-docs-eu-prod-pg-final` (its KMS key pending deletion until about 4 Dec) | [V-gh] job list of 41797685617; `2026-10-31-phase4/OLD-DOCS-RETIREMENT.md` |
| What may still accrue cost? | **Exact current spend: unknown** [U] (no Billing or Cost Explorer read was allowed). Expected sources [E]: state KMS key (shared bootstrap); Docs bootstrap KMS key(s) if any remain; ECR storage (Docs images only; the 11 shared repositories hold no image, §3); S3 state objects; the Docs final snapshot storage; CloudTrail (management events: first trail free); budgets (free). No compute, ALB, NAT, RDS instance or public IPv4 is evidenced | [U]; owner should read Billing → Bills for November |
| Budgets | Bootstrap creates `munaxa-shared-account-monthly` and `munaxa-shared-testing-monthly`, both US$50 (`bootstrap/budget.tf`, `variables.tf`) [V-repo]; G2 verification saw 2 budgets [V-aws-prior]. Separately, a pre-existing `munaxa-account-monthly` of US$10 (TD-13) and `munaxa-docs-eu-prod-monthly` exist per earlier reports [V-aws-prior, 31 Oct] | Their live state today [U] |
| Session trust path after the second re-apply | **Pending.** No `aws-session.yml` run has happened since 00:47 UTC (before the re-apply). The next scheduled run (crons 19:17 and 01:47 UTC) is the check; from 30 Oct to 5 Nov GitHub started only one scheduled run a night, up to about 5.5 h late, so it may come late | [V-gh] run list, latest run 41943924455 |

## 2. Bootstrap resources: what is evidenced

| Resource group | Expected (code) | Evidenced live | Basis |
| --- | --- | --- | --- |
| State bucket `munaxa-shared-tfstate-229251310592`, versioned, state key `bootstrap/terraform.tfstate` | yes | **Yes** | [V-aws-prior] evidence-recovery §9 O-1 (object versions read) |
| State KMS key | yes | **Yes** [E] | state objects decrypted by `GetObject` (§9) |
| 11 ECR repositories `munaxa-{identity,control,work,school}/…` | yes | **Yes, on 31 Oct** | [V-aws-prior] G2 verification; not re-read since |
| Deployers, session deployer, CI roles (6 roles) | yes | **Yes**, exact attachments | [V-aws-prior] §9 O-3 |
| 4 image publisher roles | yes | **Created 31 Oct**; current documents and trust **not read** | [V-aws-prior] G2; §9 R1 |
| Workload boundaries (nonprod, prod) | yes | **Yes**, documents equal render | [V-aws-prior] §9 O-3 |
| Budgets (2) | yes | **Yes, on 31 Oct** | [V-aws-prior] G2 |
| GitHub OIDC provider | read, not created | **Yes** (pre-existing, Docs bootstrap) | [V-aws-prior] G2 stage 1 |

## 3. Images and registries

| Product | ECR repositories (shared bootstrap) | `image/*` tags in the repository | ECR publish runs | Images in shared ECR |
| --- | --- | --- | --- | --- |
| Identity | `munaxa-identity/{api,migrate}` | **0** [V-gh `git ls-remote`] | **0** (`publish-images-ecr.yml`) [V-gh] | **None** [E, no publish run ever] |
| Control | `munaxa-control/{api,migrate,portal}` | **0** | **0** (`publish-images.yml`) | **None** [E] |
| Work | `munaxa-work/{api,admin,migrate}` | **0** | **0** | **None** [E] |
| School | `munaxa-school/{api,admin,migrate}` | **0** | **0** (dispatch-only workflow) | **None** [E] |
| Docs | `munaxa-docs/{api,web,antivirus}` (**Docs bootstrap**, not shared) | 7; latest `image/f8a8bea…` | last success 25 Oct (run 40225272398) | `f8a8bea` digests [V-aws-prior, 25 Oct]; **17 first-parent commits behind main** and before CONTROL_PLANE licensing (#160, #163) and the outbound TLS fix (#164) [V-repo] |

**Consequence:** no product can run in Testing until images are published (gate G5).

## 4. Shared stack readiness (`stack/`, not applied)

| Item | State | Evidence |
| --- | --- | --- |
| Terraform CI | "Format, validate, mocked plan tests" green on PR #49 (`08827f0`) | [V-gh] |
| Last real plan | 64 creates on `decd1dc` (5 Nov 06:04), **before** `6b8997a`; mocked plan after `6b8997a` still 64 at the same addresses | [V-gh] 41977870108; `2026-11-05-phase7/07` |
| `stack/envs/nonprod.expected-changes.json` | G3 declaration not yet on main | phase 7 owner action 4 |
| `nonprod.tfvars` | `edge_enabled = false`, `services_enabled = false`, `images = {}`, `operator_cidrs = []`, `operator_access` unset, `session_backstop_schedule = ""` | [V-repo] |
| Hosting contract | ECS Fargate in public subnets with public IPv4, no NAT, S3 gateway endpoint, RDS PostgreSQL 16 `db.t4g.micro` in isolated subnets, one bundle per service and per migration job, run-only migrations, `LICENSING_MODE = CONTROL_PLANE` for Work, School and Docs, Cloudflare Access for the operator host | [V-repo] `README.md`, `CONTRACT.md`, `services.tf` lines 537, 632, `docs.tf` line 71 |
| Session shutdown | P1 (workflow `down`, database stop on `!success()`) merged; backstop (P2/P3) merged **off**; separate 13-create apply after G3 | [V-repo] `6b8997a`; phase 7 `03` |
| B2 (IAM simulator, GetLogEvents on `/aws/other`) | **ROOT CAUSE UNRESOLVED — REMAINS BLOCKED.** Follow-up diagnostic unrun, needs owner approval | evidence-recovery `00` §4, §9 |

## 5. Status wording (committed to `infra/aws/README.md` and `CONTRACT.md` in the same PR as this folder)

`infra/aws/README.md`, replacing line 9:

> **Status (5 Nov 2026):** `bootstrap/` is applied (G2 on 31 Oct; re-applied 5 Nov at `46dfbd9` and at `6b8997a`; the second re-apply is PARTIALLY VERIFIED). `stack/` has **never been applied**: G3 is not authorized, and no Testing or Production workload resource is evidenced. No product image is in the shared ECR repositories. Current evidence: `docs/aws-migration/agent-reports/README.md`.

`infra/aws/CONTRACT.md`, replacing line 7 the same way (bootstrap applied; stack and every product item not applied).

## 6. What would close the unknowns (read-only, each needs owner approval; none proposed as required for G3)

| Unknown | Read-only check | Who |
| --- | --- | --- |
| Current spend and cost sources | Billing console, Bills → November, by service | Owner, console |
| Docs bootstrap publisher role and `munaxa-docs/*` repositories still present | ECR console, IAM console | Owner, console |
| Publisher roles' trust policies | `aws iam get-role` × 4 | Owner, CloudShell |
| No untracked nonprod resources | Tag Editor, `Environment = nonprod`, eu-central-1 | Owner, console |
