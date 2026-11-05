# Munaxa: evidence review closure and first Testing deployment readiness

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead of this thread. **Independent review:** `05-INDEPENDENT-REVIEW.md` (separate reviewer).
- **Scope:** documentation, code review and read-only readiness work. **No AWS call was made** (the root-signed AWS connector was not used), no Terraform plan or apply, no image publication, no secret, DNS, Cloudflare, IAM or GitHub-setting change, no migration, no deployment, no Render or Supabase change. CanteenHub was not inspected or touched. The only reads outside git were GitHub metadata and the **public** AWS Price List files.

## Verdict

# NOT READY — BLOCKERS REMAIN

The code in all six repositories is ready to start the Testing path: every main branch is green, no product code PR is required, runtime images never migrate on start, and every product refuses permissive licensing in production. **What is missing is entirely gated work**: the shared Testing layer (G3) has never been applied, no product image exists in the shared ECR, the shutdown backstop is off, Cloudflare Access and the signing keys are not set up, and B2 is still unresolved. Each of these needs the owner's separate approval, so none could be closed in this read-only task.

The fastest safe path is in §5: about **nine owner approvals** to reach a validated Identity + Control + Work session, at an estimated **US$11 to 12 a month idle and about US$0.17 an hour** while a session runs.

## 1. Stage 1: evidence recovery review closed

| Item | Result |
| --- | --- |
| `03-FINAL-REVIEW.md` F1 to F8 | **All applied** in platform PR #49 (branch commits `13de527`, `08827f0`), **squash-merged as `c322459`** (`c322459676cb76d435b653448f7f27bd1584f899`) after all required checks passed (one unrelated timing test in `packages/platform/auth` failed once and passed on its single re-run): §2, §3 and §6 headed historical; the copy statement corrected; revision history with `6b9eaff`, `e172389` and merge `016f3f5` (verified); F5 restated; post-16:12 CloudTrail limitation; §7 wording; index qualifiers |
| **F5 (checksum)** | Exact double equality now claimed for **5 documents only** (the reviewer's recheck); the other 9 matched within the lead's **1e-15 relative tolerance**. The #48 claim that all 14 were re-run exactly "at about 17:20 UTC" was **withdrawn**: no values were retained and it was committed at 17:13:47 UTC, before the stated time. Exact canonical JSON length for all 14 and the non-cryptographic limitation are kept |
| Fresh independent review | `2026-11-05-evidence-recovery/04-CLOSING-REVIEW.md`, separate reviewer: **AGREE WITH CHANGES**, all 8 requirements met, findings G1 to G4 (one Medium: a timing slip of the same kind as the withdrawn claim). All four applied in `08827f0` |
| Verdicts | Second re-apply **PARTIALLY VERIFIED** (unchanged). B2 **ROOT CAUSE UNRESOLVED — REMAINS BLOCKED** (unchanged). No blocker removed or weakened |

## 2. Verified facts

- **Account `229251310592`, Region `eu-central-1`** [V-repo; prior connector reads].
- **Bootstrap applied** (G2 31 Oct, re-applied twice on 5 Nov); latest state serial 4, 68 managed instances [prior reports on main].
- **Shared stack never applied.** Only 4 `aws-terraform.yml` dispatches exist, all plans; the last planned 64 creates and its Apply job was **skipped** [V-gh].
- **Old Docs eu-prod retired:** final data apply run 41797685617 succeeded (4 Nov 08:21 UTC) [V-gh].
- **No product image in the shared ECR:** 0 `image/*` tags and 0 ECR publish runs in Identity, Control, Work and School; Docs' last image `f8a8bea` is 17 commits behind main and predates CONTROL_PLANE licensing [V-gh, V-repo].
- **No open PR** in any of the six repositories other than this task's documentation PRs [V-gh].
- **All six mains green** (push CI for platform, identity, control, docs; PR CI at the merged heads of work#29 and school#24) [V-gh].
- **Health endpoints** exist where the stack probes them; **migrations are run-only** tasks; **production refuses permissive licensing** in Work, School and Docs [V-repo, `01`].
- **Prices** for the estimates come from the AWS Price List bulk files for eu-central-1 (published 19 Oct to 2 Nov 2026) [V-price, `03` §10].

## 3. Owner-reported facts

- G2 and the first re-apply outputs were pasted by the owner (31 Oct, 5 Nov). The owner stated the second re-apply was done (5 Nov 10:10 UTC); its effect was later verified by approved read-only reads.
- The Docs bootstrap, its ECR repositories and publisher role, and the final snapshot were reported kept by the retirement thread.

## 4. Inferences and unknowns

| Kind | Item |
| --- | --- |
| [E] | No Testing workload resource exists (no stack apply ever ran); untracked console-made resources cannot be excluded without an AWS read |
| [E] | Current spend is about US$1 to 4 a month (state KMS key, small storage, Docs leftovers) |
| [U] | Exact current spend (no Billing read allowed) |
| [U] | Whether `image-release` environments, `image/*` tag rulesets and `AWS_IMAGE_PUBLISHER_ROLE_ARN` exist in the product repositories |
| [U] | Whether the Cloudflare Access application exists |
| [U] | Current publisher-role trust policies (not read on 5 Nov) |
| [U] | Session trust path after the second re-apply (the next scheduled `aws-session.yml` run) |

## 5. Blockers and recommended next actions, in dependency order

Full table with evidence, severity, owner and exact action: `04-BLOCKERS-AND-OWNER-DECISIONS.md`. Runbook: `03-TESTING-DEPLOYMENT-RUNBOOK.md`.

| Order | Action | Blocker | Who |
| --- | --- | --- | --- |
| 1 | Read the next scheduled `aws-session.yml` run (trust path; may start hours late) | BL-3 | Lead, no approval |
| 2 | Decide B2: approve the 10-call read-only diagnostic (recommended) or accept B2 open for Testing (B2 keeps its UNRESOLVED label either way) | BL-2 (Critical) | Owner |
| 3 | Check Billing for current spend | BL-14 | Owner |
| 4 | Merge README runbook fixes F-1 to F-4 (docs PR) | BL-11 | Lead |
| 5 | G3 declaration PR → plan (exactly 64) → **approve G3 apply** → `down` | BL-1 (Critical) | Lead, owner |
| 6 | G6 certificate validation records within 72 h | BL-13 | Owner |
| 7 | Backstop PR (13 creates) → approve → verify the first 21:00 UTC run | BL-4 (Critical) | Lead, owner |
| 8 | Confirm repository protection; create the Cloudflare Access app; generate the Identity key pair | BL-6, BL-7, BL-9 | Owner |
| 9 | Publish Identity and Control images (G5) | BL-5 | Owner |
| 10 | Write secret values (G4); pin by PR | BL-8 | Owner, lead |
| 11 | Config A (services off) → licence public key → Config B | BL-10, BL-12 | Lead, owner |
| 12 | First session: Identity, then Control; smoke; `down` | G7 | Owner |
| 13 | Work images, Config D, migrations, Control credential, smoke; `down` | G5, G7 | Owner |

**Recommended first product: Work** (owner decision D-C): it reuses Identity, needs no S3 bucket or mail key, and is the cheapest to run. School next; Docs last (fresh images, scanner, 14 secret keys).

## 6. Expected cost and operational risk

| Item | Estimate [E] |
| --- | --- |
| Before G3 (today) | about US$1 to 4 a month; actual unknown |
| Testing idle after G3 and Config A | **about US$11 to 12 a month** (RDS storage, 3 KMS keys incl. the state key, 11 secrets, Cloud Map zone) |
| Session, Identity + Control | about **US$0.14 an hour** |
| Session, + Work | about **US$0.17 an hour** |
| Session, every service | about **US$0.30 an hour** |
| Budget headroom | about 220 session hours a month (stage 2) or 130 (every service) within the US$50 Testing budget |

**Operational risks:** a session left running (mitigated by the nightly `down`, and by the backstop once applied); RDS auto-starting after 7 days stopped; a failed migration (Testing: re-create the database); B2 accepted without diagnosis; the root-only operating model until launch (every bootstrap change needs the owner as root in CloudShell); public task IPs (mitigated by per-service security groups and the session placement check).

## 7. Independent review

`05-INDEPENDENT-REVIEW.md` (separate reviewer, unmodified): **AGREE WITH CHANGES** with the verdict NOT READY — BLOCKERS REMAIN. 15 findings, 4 Medium and 11 Low, none Critical or High. All were applied before this folder was committed: R-1 and R-14 (status wording and PR state now stated as they stand), R-2 (Work smoke check through the target group, not a public path), R-3 (the GitHub schedule is not a reliable shutdown; BL-3 has a cut-off), R-4 (backstop now Critical), R-6 and R-7 (one idle figure, US$11 to 12), R-8 to R-13 and R-15. R-5 is applied in part: the stale `valkey_image` description is in `stack/variables.tf`, a Terraform file, and is left for the next infrastructure PR.

## 8. Confirmation

In this task **no AWS change, no deployment, no migration, no secret change, no DNS or Cloudflare change and no production action was performed.** No AWS API was called. The root connector was not used. No image was published, no workflow was dispatched, and no GitHub setting was changed. The only repository writes were documentation PRs in `munaxa-platform`.

## Files

| File | Content |
| --- | --- |
| `00-EXECUTIVE-READINESS-REPORT.md` | This summary |
| `01-REPOSITORY-READINESS-MATRIX.md` | Six repositories: CI, PRs, images, config, secrets, migrations, health, auth, licensing, rollback |
| `02-AWS-INFRASTRUCTURE-READINESS.md` | Status reconciliation of `infra/aws`, what exists, what is verified |
| `03-TESTING-DEPLOYMENT-RUNBOOK.md` | PRs, resource changes, images, secrets, DNS, sequence, smoke tests, rollback, costs |
| `04-BLOCKERS-AND-OWNER-DECISIONS.md` | BL-1 to BL-16, decisions D-A to D-F |
| `05-INDEPENDENT-REVIEW.md` | Separate reviewer's verdict on this folder (unmodified) |
