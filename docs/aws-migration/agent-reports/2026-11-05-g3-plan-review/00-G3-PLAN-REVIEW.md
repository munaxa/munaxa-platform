# Munaxa G3 Testing infrastructure plan review

- **Date:** 5 Nov 2026, from 20:00 UTC (written 20:00 to about 20:40 UTC). **Author:** the lead of this thread. **Independent review:** `05-INDEPENDENT-REVIEW.md` (separate reviewer).
- **Scope:** **read-only.** Repository inspection, GitHub metadata, a local **mocked** Terraform plan (no credentials, no AWS call) and documentation in this folder. **No AWS API call** (the root connector was not used, as the owner required), no Terraform plan or apply against AWS, no IAM, DNS, Cloudflare, secret, image, deployment, migration, Render, Supabase or production change, nothing stopped or deleted. CanteenHub was not inspected or touched.
- **Evidence read first:** `2026-11-05-testing-readiness/00` to `05` (platform #50, `0c58174`, verdict NOT READY), `2026-11-05-evidence-recovery/` (closed in #49, `c322459`), `2026-11-05-next-diagnostic/` (#46, `6ab69d1`), `2026-11-05-bootstrap-reapply/04` (run 41977870108), `2026-11-05-phase7/07` (G3 plan impact). Nothing infrastructure-related was merged after `6b8997a` (`01` header).

## Verdict

# READY FOR G3 OWNER APPROVAL

**This does not authorize deployment.** G3 is applied only when the owner approves it, through the conditions in `04` §4.

The 64 resources are the reviewed persistent layer and nothing else: no ALB, no NAT, no service, no image, no secret value, no production resource, no CanteenHub reference. Two blockers of the previous report are now settled: **B2 by the owner's Testing-only acceptance** (not by evidence) and **current spend by the owner's Cost Explorer read**, whose size and timing are consistent with the old Docs stack (an inference, `02` §2). **The approval must also cover decision D-B** (accept the second bootstrap re-apply as PARTIALLY VERIFIED, left open in `2026-11-05-testing-readiness/04` §2 and not taken in the owner's 20:00 brief): if the owner does not accept it, the verdict becomes NOT READY — BLOCKERS REMAIN (`04` OD-10, independent review R-2). What remains are conditions of the apply itself (a fresh plan must match the 64, the database must be stopped right after, the certificate validated within 72 hours) and the blockers of the first session, which come after G3 by design.

## 1. Exact Terraform commit

- Code under review: `munaxa-platform` main **`0c58174a5088560f2fb28748f331ac604c84aaae`**; the stack, modules, `aws-terraform.yml` and `scripts/terraform` are byte-identical to `6b8997a4f9793989abfddae205b4dd6f4ed1d20c` (tree `infra/aws/stack` `614a12d3e1133f142437bc6c7d136cd27ba2f90d`) [V-repo].
- **The commit to apply is the merge commit of the G3 declaration PR** (`04` C-1), which must change only `infra/aws/stack/envs/nonprod.expected-changes.json` on top of `0c58174` (or a later docs-only main). The owner should check that the dispatch's head SHA is that merge commit and that `git diff 0c58174 <merge> -- infra .github scripts` shows only the declaration file.

## 2. Exact 64 resource addresses

Listed and reviewed one by one in `01` §2, and as a file: [`supporting/g3-mocked-plan-0c58174-addresses.txt`](supporting/g3-mocked-plan-0c58174-addresses.txt) (sha256 `eb9f18440ead1cb011e8ad2ee03f7c6b8809ee5ac2a0b27117067dba974a5f79`), byte-identical to the real plan run's list. The ready-to-commit declaration: [`supporting/nonprod.expected-changes.g3-DRAFT.json`](supporting/nonprod.expected-changes.g3-DRAFT.json) (64 `create`, validated by `check-plan-intent.sh --validate`).

## 3. Plan evidence and its limitations

| Evidence | Result | Limitation |
| --- | --- | --- |
| Real plan [run 41977870108](https://github.com/munaxa/munaxa-platform/actions/runs/41977870108), head `decd1dc`, 5 Nov 06:03 to 06:04 UTC [V-gh] | 64 to add, 0 change, 0 replace, 0 destroy | Older stack code (before `6b8997a`); addresses only, no attribute values; nothing applied |
| Mocked plan at `0c58174`, this task [L] | `Plan: 64 to add, 0 to change, 0 to destroy`; same 64 addresses byte for byte | Not AWS; proves the configuration, not AWS acceptance or deployer permissions |
| Declaration on main | **empty** | The G3 PR adds it |
| Apply path of `aws-terraform.yml` | never run | First run is G3 |

**Missing:** a real plan at the declaration commit; it will be produced, and enforced against the declaration, by the plan job of the approved G3 dispatch. No new AWS plan was generated here (not authorized).

## 4. Expected cost and budget impact [E unless stated]

| Item | Figure |
| --- | --- |
| **Actual, 1 to 6 Nov** [O-rep] | **US$5.99** (ELB 2.13, RDS 1.96, VPC 0.79, Route 53 0.50, KMS 0.42, Secrets 0.13, ECR 0.04, S3 0.02) |
| Source of the actual [E] | About US$5.4 is consistent with the old Docs eu-prod stack before its retirement on 4 Nov 06:47 to 07:55 UTC (ALB 79.0 h at 0.027; 2 IPv4 × 78.9 h; RDS; its Cloud Map zone; 3 secrets × 79 h). Not recurring. Inference from timing and unit prices; not verifiable without an AWS read |
| Recurring today | about US$2.5 to 3 a month (two state KMS keys, ECR, S3; Docs final snapshot until deleted) |
| **After G3, idle** | **about US$11 to 12 a month** (G3 adds about 8.7: RDS storage 2.74, 11 secrets 4.40, data key 1, Cloud Map zone 0.50) |
| Session | about **US$0.14/h** Identity + Control; **0.17/h** + Work; 0.30/h every service |
| Normal month (40 session-hours, stage 2) | about **US$19 to 21** |
| Left running by accident | database only US$0.46/day; session (stage 2) US$4.1/day, about US$124/month; ALB only US$0.89/day |
| Budget | idle uses about 23 % of the US$50 target; about 220 session-hours of headroom at 0.17/h |

Full model, unknowns and service-by-service impact: `02`.

## 5. Remaining DNS dependencies

ACM validation records (2 CNAMEs, DNS only) **within 72 hours of G3 and before the first `up`**; host CNAMEs to `alb_dns_name` at the first session (`operator-test.munaxa.com` proxied behind Cloudflare Access, the others DNS only). **New finding DNS-H1:** the ALB is recreated at every `up`, so its DNS name and therefore every CNAME must be **updated every session**, not only the first as the README says. Order and details: `03`.

## 6. Remaining security risks

| Risk | Status |
| --- | --- |
| **B2** (simulator implicitDeny on `/aws/other`) | **ROOT CAUSE UNRESOLVED — ACCEPTED FOR TESTING ONLY**; no IAM change; not for Production (`04` §2) |
| Second bootstrap re-apply PARTIALLY VERIFIED; session roles not exercised since; the narrowed deployer has never planned or created anything since that re-apply | D-B (owner) and hard stop C-3; the G3 plan job is the first exercise of the current deployer |
| Root-only operations until launch | Owner decision OD-8; every bootstrap change needs the owner as root |
| Public task IPs (no NAT) | By design; per-service SGs and the session placement check |
| Database runs from creation; backstop off | Conditions C-3 and C-6 |
| Log groups and file buckets not encrypted with the data key | Low (`01` G-L1, G-L2) |

No Critical or High finding in the 64 resources (`01` §4).

## 7. Exact next owner action

1. **Decide** whether to approve G3 on these terms (this package), **including D-B** (accept the second re-apply as PARTIALLY VERIFIED).
2. If approved: tell the lead to open the **G3 declaration PR** (C-1, documentation-shaped, changes only `envs/nonprod.expected-changes.json`); approve and merge it.
3. Dispatch `aws-session.yml` `down` once (C-3 pre-check, a **hard stop**: any AccessDenied or any ending other than "state key not found" means do not apply), then `aws-terraform.yml` `nonprod` / `apply` at the merge commit; read the plan job (exactly the 64), approve the apply job; dispatch `down` immediately afterwards; add the ACM validation records the same day.

## Verified facts, estimates, inferences, missing evidence, owner decisions

| Kind | Items |
| --- | --- |
| **Verified** [V-repo, V-gh, L] | Commit and tree SHAs; empty declaration on main; run 41977870108 metadata; mocked plan 64/0/0 with identical addresses; no NAT; resource configuration (`01`); old Docs teardown run times; no `aws-session.yml` run since 00:47 UTC on 5 Nov; B2 script sha256 |
| **Owner-reported** [O-rep] | Cost Explorer figures; B2 follow-up results |
| **Estimates** [E] | All monthly and hourly costs; attribution of the actual charges |
| **Inferences** [E] | ALB DNS name changes per session; B2 table row 5 reading (only if row 1 is ruled out by the raw output); secrets pending deletion not charged |
| **Missing** [U] | Real plan at the apply commit and whether the current deployer may create the 64; whether `Environment` is an active cost allocation tag; raw B2 follow-up output; cost split by usage type; snapshot size; CAA records; session trust path after the second re-apply |
| **Owner decisions** | OD-1 to OD-9 (`04` §1); **D-B still to decide** (OD-10) |

## Independent review

`05-INDEPENDENT-REVIEW.md` (separate reviewer, unmodified): **AGREE WITH CHANGES**, agrees with the verdict on the condition that the owner's approval also covers D-B. 13 findings (6 Medium, 6 Low, 1 Info), none Critical or High. All applied before commit: R-1 (B2 row 1 not ruled out), R-2 (D-B as OD-10, C-3 a hard stop), R-3 (cost attribution labelled an inference), R-4 (old Docs retained automated backups), R-5 (current deployer never exercised), R-6 (timestamps corrected), R-7 (50-minute job timeout), R-8 to R-12 (wording, cost allocation tag, CanteenHub grep wording), R-13 (the reviewer read run 41977870108's job log directly: 64 `create` rows, byte-identical addresses). After the review, Prettier reformatted whitespace in the draft declaration (the repository's format check): its sha256 changed from `d7ca102a…b56b904` (as cited in `05`) to `7653ee6a…dacbe9f`; it still validates with 64 `create` entries.

## Files

| File | Content |
| --- | --- |
| `00-G3-PLAN-REVIEW.md` | This verdict |
| `01-G3-RESOURCE-REVIEW.md` | All 64 addresses, the 15 verification points, findings |
| `02-COST-ANALYSIS.md` | Actual charges explained; idle, session, monthly and accident costs |
| `03-DNS-G6-READINESS.md` | Records, 72-hour window, Cloudflare proxy, order |
| `04-REMAINING-BLOCKERS.md` | Owner decisions, B2 record, conditions, remaining blockers |
| `05-INDEPENDENT-REVIEW.md` | Separate reviewer's verification and limitations |
| `supporting/` | Mocked plan text and addresses, harness, draft G3 declaration |
