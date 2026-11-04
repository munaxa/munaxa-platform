# Phase 5: master readiness status

Date: 4 Nov 2026, as of about 16:10 UTC. munaxa-platform main `46dfbd9` (#38). Labels: [V] verified, [E] estimated, [R] recommended, [U] unverified, [O] owner action required.

## Gate status

| Gate | Area | Status | Evidence |
| --- | --- | --- | --- |
| OIDC | GitHub OIDC to `munaxa-shared-ci-nonprod` | **Working [V]** | Run 41820815532, job 126543183878, step 5 success at 12:06:47 UTC |
| OIDC | CI role to `munaxa-shared-deployer-nonprod` | **Blocked [V]**: `AWS_DEPLOYER_ROLE_ARN` lacks the path `/munaxa-shared/bootstrap/` | Runs 41820815532 and 41865393534 (18:16 UTC), step 6, AccessDenied; `G3-PLAN-REVIEW.md` §1 |
| Envs | `aws-nonprod` exists with a protection rule | [V] the dispatch went to `waiting`, the owner approved | Run 41820815532 |
| Envs | `aws-nonprod-session`, `aws-prod`, product `image-release` | [U] APIs 403; no run has used them yet | `01-GITHUB-OIDC-CI-READINESS.md` |
| Schedule | `aws-session.yml` nightly run uses the variables | [U]: all 5 runs up to 41747107325 (00:28:44) were skipped; next about 23:00 UTC 4 Nov to 02:30 UTC 5 Nov | `01` §3 |
| B2 / TD-14 | Deployer reach to untagged and foreign resources | **Fixed in code (platform#38), open in AWS** until a root re-apply. Residuals R1 to R10 need acceptance | `02`, `06` §8 to §9 |
| H-1 to H-3 | Shared boundary, state key and alias, session path | Fixed in code (#38), open in AWS | `06` |
| Terraform | Stack code, local gates, G3 list | **Ready in code [V]**: fmt, validate, tests (bootstrap 9/9, stack 14/14), shellcheck, intent validate, SQL hash; mocked plan 64 creates | `03` |
| Real plan | Plan against AWS | **Not run** (both runs stopped at init) | `G3-PLAN-REVIEW.md` |
| Cost | US$50 Testing target | **Meets it [E]**: stack idle US$8.64 to 11.14 a month, account idle about US$14.34, session US$0.29 to 0.34 an hour, about 117 session hours fit | `04` |
| Identity | | Ready with caveats after identity#5 [V merged] | `05` |
| Control | | Ready with caveats (start order needs a services-off first step) | `05` |
| Work | | Ready with caveats after work#28 [V merged] | `05` |
| School | | Ready with caveats | `05` |
| Docs | | Ready with caveats (fresh image from main needed; depends on the retained Docs bootstrap ECR) | `05` |
| Review | Independent review | Done by a separate agent (Agent 6), two stages and a re-review; verdicts in `06` §9 | `06` |

## PRs in this phase

| PR | Repo | Head | Merge | Checks | What |
| --- | --- | --- | --- | --- | --- |
| #37 | munaxa-platform | 6df77ff | c688e9e (squash) 11:23 UTC | 4 required success (runs 41818820881, 41818820883) | Session guard before G3, DB always stopped on `down`, no plan values in public logs, saved-plan age and commit check, backend `kms_key_id` |
| #38 | munaxa-platform | 0ff0879 | 46dfbd9 (squash) 12:06 UTC | 4 required success (runs 41824313136, 41824313154) | B2/TD-14, H-1, H-2, H-2b, H-3 in bootstrap code |
| #5 | munaxa-identity | 92fdf97 | 4001ed8 (squash) | `verify` success (run 41818730529) | RDS eu-central-1 CA bundle for the node-postgres bootstrap scripts |
| #28 | munaxa-work | 246edc5 | f812dfe (merge) | 4/4 success (run 41818706797) | RDS CA bundle for the Work API and tenant bootstrap |
| this report | munaxa-platform | - | - | - | Phase 5 reports and index line (docs only) |

## Not done in this phase (by design)

G3 apply, any resource creation, IAM change in AWS, image publish, secret write, DNS, migrations, Testing session, production, Render, Supabase, Docs bootstrap or its snapshot and key, CanteenHub.
