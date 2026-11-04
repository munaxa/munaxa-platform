# Phase 5: decisions and blockers

Date: 4 Nov 2026. Lead orchestrator. Labels: [V] verified, [E] estimated, [R] recommended, [U] unverified or inaccessible, [O] owner action required.

## 1. Decisions taken in this phase

| Id | Decision | By | Evidence |
| --- | --- | --- | --- |
| P5-D1 | Dispatch the read-only nonprod Terraform plan before the `aws-nonprod` environment could be verified through the API (the token gets 403) | Tamer, decision card, 4 Nov 11:25:54 UTC | Card in the project thread; run 41820815532 |
| P5-D2 | Merge code-only PRs under the standing rule: platform#37, identity#5, work#28, platform#38 (after the independent re-review) | Lead, standing rule of 30 Oct, restated in the Phase 5 brief | PR heads, check runs and merge SHAs in `00-lead-orchestrator.md` §4 |
| P5-D3 | B2 / TD-14 is fixed in code (platform#38) and **not** in AWS. Applying it means a root re-apply of `infra/aws/bootstrap`, which needs separate approval. It was not done in this phase | Lead, following the brief (§5: no IAM change to AWS) | `02-SECURITY-B2-TD14.md`, `06-INDEPENDENT-REVIEW.md` §8 to §9 |
| P5-D4 | The proposed G3 declaration (64 creates) is kept as a report file and **not** committed to `envs/nonprod.expected-changes.json`. Committing it is the G3 approval PR | Lead (README, gate G3) | `G3-PLAN-REVIEW.md`, `supporting/PROPOSED-nonprod.expected-changes.json` |
| P5-D5 | The AWS MCP connector, which is signed in as account root, was available in this session and was **not used** | Lead, following the brief (§5) | This report; no AWS call appears in any agent's evidence |

## 2. Blockers and owner actions, in the order they are needed

| # | Item | Why it blocks | Owner action [O] | Blocks |
| --- | --- | --- | --- | --- |
| B-1 | ~~Approve the plan job and fix `AWS_DEPLOYER_ROLE_ARN`~~ **Done** | Runs 41820815532 and 41865393534 failed on the variable; the owner fixed it and approved run 41887322394, which passed (64 creates) [V] | None | - |
| B-2 | **Root re-apply of the bootstrap with platform#38** | B2 / TD-14, H-1, H-2, H-2b and H-3 are closed only once AWS has the new policies | Separate approval, then in CloudShell as root: `terraform init -reconfigure`, plan (expect 19 add, 4 real in-place changes, 0 destroy; up to 8 changes shown, of which 2 are budget artifacts and 2 are identical trust re-reads), review, apply. Same sitting: set `AWS_CI_ROLE_ARN` and `AWS_DEPLOYER_ROLE_ARN` on the `aws-nonprod-session` environment from the new outputs, then run `b2-owner-simulation.sh` (214 read-only simulations) and expect 0 mismatches | G3 apply |
| B-3 | **Accept or close residuals R1 to R10** (B2 report §7, review §8.5) | The allow-list cannot scope a few AWS actions (untagged KMS keys, ACM certificates, Cloud Map, default security groups, Route 53 zones, reads, trust content, own resource policies, CIDR ingress in the session) | Either confirm that eu-central-1 holds no untagged KMS keys, ACM certificates, Cloud Map namespaces or foreign security groups that matter, or formally accept R1 to R10 | G3 apply (formal acceptance) |
| B-4 | **A fresh plan after the re-apply** | The passing plan (run 41887322394) ran under the old, broader deployer. It cannot show that the #38 allow-list is enough | Lead dispatches a plan; owner approves it in `aws-nonprod` | G3 apply |
| B-5 | **G3 approval PR**: commit the 64-create declaration to `envs/nonprod.expected-changes.json` | The apply enforces the declaration exactly | Owner approves the PR and the apply dispatch | G3 apply |
| B-6 | **G6 DNS within 72 hours of G3** | ACM gives up DNS validation after 72 h. A dead certificate needs a code change, because `-replace` is not allowed | Plan the Cloudflare validation records (G6) for the same day as G3, or accept a later code change | Testing sessions |
| B-7 | **Dispatch `down` right after the G3 apply** | The G3 apply creates the database running; the nightly backstop fires 3 to 6 hours late | Lead dispatches `aws-session.yml` down after G3 (no reviewer on `aws-nonprod-session`) | Cost |
| B-8 | **Final Docs snapshot and its key, about 4 December** | The final snapshot `munaxa-docs-eu-prod-pg-final` stays billed after its KMS key is deleted (key 9758d15e… deletion about 4 Dec 08:21 UTC), and is unreadable after that | Delete the snapshot, or cancel the key deletion if the snapshot must be kept. Do **not** remove the Docs bootstrap: new Docs pulls from its ECR repositories with its publisher role | Cost only |
| B-9 | **Docs US$10 account budget (TD-13)** | `munaxa-account-monthly` (US$10) will alert every month after G3 | Raise or remove it (root, through the Docs bootstrap) | Noise only |
| B-10 | **Branch and tag protection in identity, control, work, school** | `main` is unprotected and `image/*` tags have no ruleset; `image-release` reviewers are [U] | Add a main ruleset and an `image/*` tag ruleset in each, and confirm `image-release` has a required reviewer | Image publish (G5) |
| B-11 | **Required approvals on platform main** | The ruleset requires 0 approvals. An unreviewed workflow merged to main reaches the session deployer (R10) | Decide whether to require 1 approval (would end auto-merge by Claude) | Risk acceptance |

## 3. Conflicts reconciled

| Topic | Positions | Resolution |
| --- | --- | --- |
| Tonight's scheduled `down` run | Agent 1 traced the old code: fails closed and red. Agent 6 and Agent 3: after #37, green with a notice, no S3 write | #37 (c688e9e) supersedes Agent 1's §4 trace. Expected: green notice [E]; to be confirmed from the run log |
| Agent 4 §7 #2 "variables absent" | Agent 4 inferred absence from the skipped runs up to 00:28 UTC | Superseded: the owner reported the variables at 08:59 UTC. Still [U] until a run uses them |
| B2 patch at 8170e12 | Agent 2: ready. Agent 6: would break the RDS master secret (B-1, `aws:CalledVia` does not cover RDS) and session refresh (B-2) | Agent 2 confirmed both and fixed them (0ff0879). Agent 6 re-reviewed and accepted |
| Bootstrap state encryption | Phase 4 SECURITY-VERIFICATION §3 said state is KMS-encrypted | Agents 3 and 6 checked Terraform 1.16.5 `client.go`: objects are SSE-S3 when `encrypt = true` and no `kms_key_id` is set. The phase 4 check read the bucket default, not the object. #37 fixes the stack; #38 fixes the bootstrap after the re-apply |
| "Prisma services are not affected" by `sslmode=require` | Agent 5: not affected. Agent 6: true, but because Prisma does not verify the certificate | Both recorded. Low risk inside the VPC; [R] strict verification later |
| H-2b introduced by #37 | The alias ARN in the backend files became a target | Closed in #38 (`NeverSharedAliases`) once re-applied |
