# Blockers and owner decisions for the first Testing deployment

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead. Documentation only; nothing below has been done unless stated.
- **Severity:** **Critical** = the first session cannot start, or would start unsafely. **High** = a required step of the first session fails without it. **Medium** = needed before the session is called validated, or a safety margin. **Low** = clean-up.
- **Labels:** [V-repo], [V-gh] read in this task; [V-prior] earlier report on main; [O-rep] owner statement; [E] inference; [U] unknown.

## 1. Blockers

| # | Blocker | Severity | Evidence | Owner | Exact action to close it |
| --- | --- | --- | --- | --- | --- |
| BL-1 | **G3 (shared persistent layer) not applied.** No VPC, RDS, KMS data key, bundles, cluster | Critical | [V-gh] only 4 `aws-terraform.yml` dispatches, all plans; 41977870108 Apply job skipped; plan 64 creates | Lead (PR), owner (approval) | Lead opens the G3 declaration PR (`stack/envs/nonprod.expected-changes.json`, the 64 addresses of phase 7 `07`). Owner dispatches `aws-terraform.yml` `nonprod`/`plan`; the plan must be **exactly** the 64 declared creates on a commit after `6b8997a`; owner approves the apply in `aws-nonprod`; then `aws-session.yml` `down` |
| BL-2 | **B2: IAM simulator gave implicitDeny for GetLogEvents on `/aws/other`** — ROOT CAUSE UNRESOLVED — REMAINS BLOCKED | Critical: while B2 is open the prior reports do not claim G3 readiness (next-diagnostic `00` line 13) | evidence-recovery `00` §4, §9; next-diagnostic `01` | Owner (decision) | Either approve and run the 10-call read-only `next-diagnostic/supporting/b2-followup-diagnostic.sh` (sha256 `83bdb7ac…f6d6`) and have the lead interpret it against `01` §5, **or** explicitly decide that G3 may proceed with B2 open (residual risk: a log read on a foreign `/aws/*` group may not be explicitly denied; the deployer still has no allow for it). The lead recommends running the diagnostic first: 10 free read-only calls. Either way, B2 stays `ROOT CAUSE UNRESOLVED — REMAINS BLOCKED` until evidence resolves it; accepting it is a recorded risk acceptance for Testing only, not a closure |
| BL-3 | **Second re-apply only PARTIALLY VERIFIED**; session trust path after it not yet exercised | Medium | evidence-recovery `00` §1, §8 | Lead (read), owner (decision) | Lead reads the next scheduled `aws-session.yml` run log (crons 19:17 and 01:47 UTC; GitHub has started them up to about 5.5 h late or skipped one; if no scheduled run has finished by 08:00 UTC on 6 Nov, the owner may dispatch `down` by hand, which is read-only before G3) (must assume both session roles without AccessDenied; "state key not found" ending is expected before G3). Owner decides whether PARTIALLY VERIFIED is enough or wants a separately approved no-change bootstrap plan |
| BL-4 | **Shutdown backstop off.** Testing must not run before the AWS-side backstop exists and is verified (D-4 = B); the GitHub schedule alone is not reliable (only one scheduled `aws-session.yml` run a night from 30 Oct to 5 Nov, up to about 5.5 h late) | Critical | [V-repo] `nonprod.tfvars` `session_backstop_schedule = ""`; phase 7 `03`, `09` items 5 and 6 | Lead (PR), owner (approval) | After G3: PR sets `session_backstop_schedule = "cron(0 21 * * ? *)"` with a 13-create declaration; owner approves plan and apply; owner checks the first 21:00 UTC run's Scheduler metrics show no target error |
| BL-5 | **No product image in the shared ECR**; Docs image stale | Critical | [V-gh] 0 `image/*` tags and 0 ECR publish runs in identity, control, work, school; Docs `f8a8bea` 17 commits behind | Owner | Per product: confirm `image-release` environment (required reviewer) and `AWS_IMAGE_PUBLISHER_ROLE_ARN` variable exist; push tag `image/<40-hex main SHA>` (School: dispatch the workflow from that tag); approve `image-release`; record digests from the run summary |
| BL-6 | **Repository protection for image tags unknown** (`image/*` tag rulesets, `image-release` reviewers, publisher role variable) | High | [U] no read API; phase 7 `05` O-2 to O-6 | Owner | Confirm in GitHub settings for identity, control, work, school; if absent, apply the JSON in phase 7 `supporting/rulesets/` |
| BL-7 | **Cloudflare Access application for `operator-test.munaxa.com` not evidenced**; Terraform refuses any Control image without `operator_access` | Critical for Control | [V-repo] `variables.tf` 150; `nonprod.tfvars` commented | Owner | Create the Access app with an MFA Require rule (`infra/aws/cloudflare-access.md`); give the lead the team domain and AUD (public values) |
| BL-8 | **Secret values not written** (G4) and not pinned | Critical | [V-repo] bundles exist only after G3; nothing pinned in `secret_version_ids` | Owner (values), lead (pin PR) | After G3, write each bundle listed in `03` §5 in the console/CloudShell (never Git, logs or chat); lead opens the `secret_version_ids` PR |
| BL-9 | **Identity signing key pair, kid and public keys unset** | Critical for Identity and Work | [V-repo] defaults `""`, `"[]"` | Owner | `pnpm keys:generate` locally in munaxa-identity; private half to the `identity` bundle; public half and kid by PR |
| BL-10 | **Control licence key two-step**: the KMS key exists only after a services-off apply; its public half must then be set by PR | High | [V-repo] `variables.tf` 304 to 313; README G7 step 0 | Owner (CloudShell read), lead (PR) | Config PR A (digests, services off) → apply → `aws kms get-public-key` (DER → PEM) → config PR B → apply |
| BL-11 | **Runbook ordering gaps F-1 to F-4** (config PRs need a services-off `aws-terraform.yml` apply, not `up`; Work role assignment step; stale text) | Medium | [V-prior] phase 7 `06`, `09` | Lead | Docs-only change to `infra/aws/README.md` (F-1 to F-3 and F-4 except the `valkey_image` description in `stack/variables.tf`, which is Terraform and left for the next infrastructure PR); in this folder's PR |
| BL-12 | **Digests for `valkey_image` and `postgres_image`** not set | High | [V-repo] `nonprod.tfvars` | Lead (PR), owner (confirm digest) | Owner re-reads both in the ECR Public Gallery on the day; lead sets them in config PR A |
| BL-13 | **G6 DNS**: ACM validation records within 72 h of G3, then CNAMEs to the ALB on the first session | Critical (TLS) | [V-repo] README G3 step 3, G7 step 2 | Owner | Add `certificate_validation_records` as DNS-only records in Cloudflare after G3; add host CNAMEs (DNS only) after the first `up`; `operator-test` proxied |
| BL-14 | **Exact current AWS spend unknown** | Medium | [U] no Billing read allowed | Owner | Read Billing → Bills (November) by service; confirm the account is near US$0 to 3 before G3 |
| BL-15 | **School database name** (`school` vs `school_db`) | Medium (School only) | [V-prior] phase 7 `06` S-3 | Owner | Choose one; both School URLs must use it |
| BL-16 | **Docs publisher role and `munaxa-docs/*` repositories after the retirement** | Medium (Docs only) | [U] | Owner | Confirm in the console before tagging Docs |

## 2. Owner decisions

| # | Decision | Options | Lead recommendation |
| --- | --- | --- | --- |
| D-A | B2 before G3 | Run the 10-call diagnostic first; or proceed with B2 open as an accepted Testing risk | **Run the diagnostic first** (free, read-only, about 5 minutes) |
| D-B | Accept the second re-apply as PARTIALLY VERIFIED | Accept; or ask for a no-change bootstrap plan in CloudShell | **Accept for Testing**, with tonight's session-run check |
| D-C | First product after Identity and Control | Work; School; Docs | **Work.** It shares Identity, has no S3 or mail dependency, smallest per-hour cost (about US$0.17/h with Identity and Control); Docs needs 3 fresh images, a scanner and 14 secret keys |
| D-D | Approve G3 (64 creates), then G6 within 72 h, then the backstop apply | Each separately | Approve in that order, on separate cards |
| D-E | Approve image publication per product | Each tag separately | Identity and Control first, then Work |
| D-F | Bot identity (R14, phase 7) | Machine user; or continue as now | Unchanged from phase 7; not a Testing blocker |

## 3. Not blockers for Testing, carried

- Production blockers R7, R19, R20, member accounts (R15), and every residual risk must be re-decided before production (phase 7 `01`).
- Review items L-1 to L-3 (phase 7) need a further bootstrap re-apply; not required for the first session.
- Docs final snapshot `munaxa-docs-eu-prod-pg-final`: decide around 4 Dec 2026 (delete, or cancel the key deletion).
- TD-13: the pre-existing US$10 `munaxa-account-monthly` budget will alert monthly once G3 resources exist.
