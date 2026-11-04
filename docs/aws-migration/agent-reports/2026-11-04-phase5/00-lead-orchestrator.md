# Phase 5: parallel readiness, security closure and G3 plan preparation (lead report)

Date: 4 Nov 2026, 10:00 to about 16:15 UTC. Requested by Tamer (brief of 10:00 UTC). Lead orchestrator: Claude, with six separate Claude agents. Labels: [V] verified, [E] estimated, [R] recommended, [U] unverified or inaccessible, [O] owner action required.

Baseline at start: munaxa-platform main `00667f3` (#36). End: munaxa-platform main `46dfbd9` (#38), munaxa-identity main `4001ed8`, munaxa-work main `f812dfe`; munaxa-control `a24c568`, munaxa-school `54cf3eb`, munaxa-docs `b8c7e25` unchanged.

## 1. Files in this folder

| File | Author |
| --- | --- |
| `00-lead-orchestrator.md` (this file) | Lead |
| `MASTER-READINESS-STATUS.md` | Lead |
| `01-GITHUB-OIDC-CI-READINESS.md` | Agent 1 |
| `02-SECURITY-B2-TD14.md` | Agent 2 |
| `03-TERRAFORM-G3-PLAN-READINESS.md` | Agent 3 |
| `04-COST-AND-BUDGET.md` | Agent 4 |
| `05-CROSS-PRODUCT-READINESS.md` | Agent 5 |
| `06-INDEPENDENT-REVIEW.md` | Agent 6 (independent) |
| `AGENT-TASK-LEDGER.md` | Lead |
| `G3-PLAN-REVIEW.md` | Lead |
| `DECISIONS-AND-BLOCKERS.md` | Lead |
| `NEXT-EXECUTION-PLAN.md` | Lead |
| `supporting/` | G3 address list, proposed declaration, owner simulation script, count by type |

Agent reports 01 to 06 are the agents' own text. Paths such as `phase5/evidence/0N/...` in them refer to the agents' working evidence folders, which were not published (they hold raw logs, rendered policies and harness files); the four files a reviewer needs are in `supporting/`, and every run ID, SHA and PR cited can be checked on GitHub. Where a later event superseded a line in them, `DECISIONS-AND-BLOCKERS.md` §3 records it rather than editing their reports. Two examples: Agent 1's trace of the nightly run predates #37, and Agent 4 §7 #2 predates the owner's 08:59 report.

## 2. Final answers

1. **Is the GitHub OIDC → CI role → deployer chain working?** **Half.** GitHub OIDC to `munaxa-shared-ci-nonprod` works [V] (run 41820815532, job 126543183878, step 5, 12:06:47 UTC). CI role to deployer **fails** [V]: STS AccessDenied, because the repository variable `AWS_DEPLOYER_ROLE_ARN` is `arn:aws:iam::229251310592:role/munaxa-shared-deployer-nonprod` and is missing the path `/munaxa-shared/bootstrap/`. A second run (41865393534, approved 18:16 UTC) failed the same way: the job still received the ARN without the path [V]. [O] Fix the variable, checking both the repository variable and any `aws-nonprod` environment variable of the same name; then the plan is dispatched again.
2. **Is B2 / TD-14 resolved?** **In code, yes; in AWS, no.** platform#38 (46dfbd9) replaces the tag denies with positive allow-lists:
   - creates need both request tags;
   - writes are allowed only on own-named or own-tagged resources;
   - account settings, sharing and protected VPCs are denied;
   - each environment has its own boundary (H-1);
   - the state key, its aliases and the state bucket are protected by ARN (H-2, H-2b);
   - sessions get their own roles (H-3).

   Evidence: `terraform test` passes 9/9 with mutation checks. A local evaluator (not an AWS simulation) passes 85/85 matrix cases, 183/183 G3 calls and 107/107 session-refresh calls. Agent 6 blocked the first version (B-1, B-2) and accepted the fix at 0ff0879. It takes effect only after a root re-apply of the bootstrap and the 214-call owner simulation, which this phase did not authorize. The old Docs VPC was destroyed in run 41794933464, so no Docs VPC inventory was needed [V]. Residuals R1 to R10 need owner acceptance [O].
3. **Is the current Terraform G3 configuration ready?** **The code is ready [V]; G3 is not.** All local gates pass, and the mocked plan is 64 creates with no updates or deletes. The real plan has not run (answer 1), the bootstrap re-apply is pending, and the plan after it must match the declaration.
4. **What exact resources will G3 create, update or destroy?** From the mocked plan: **64 creates, 0 updates, 0 destroys**, listed by type in `G3-PLAN-REVIEW.md` §2 and by address in `supporting/g3-expected-addresses.txt`. They are:
   - network: VPC, IGW, 5 subnets, 2 route tables, 1 route, 5 associations, S3 gateway endpoint, default SG;
   - database: DB subnet group, parameter group, db.t4g.micro PostgreSQL 16;
   - KMS key and alias;
   - 10 Secrets Manager containers, with no values;
   - 2 S3 buckets with their configurations;
   - 3 security groups with 3 ingress and 2 egress rules;
   - 2 IAM roles with inline policies;
   - an ECS cluster and its capacity providers;
   - a Cloud Map namespace, an ops log group and an ACM certificate request.

   [U] until the real plan confirms it.
5. **Does the architecture meet the US$50 Testing target?** **Yes [E].**
   - The stack costs about US$8.64 to 11.14 a month idle, and the whole account about US$14.34 including both bootstraps and the Docs final snapshot.
   - A session hour costs US$0.29 to 0.34, so about 117 session hours a month fit (range 90 to 134).
   - Prices come from the AWS public price list for eu-central-1, fetched 4 Nov. No live charge was read: the only available AWS identity is root.
   - Risks: the database is created running by G3, and the nightly backstop fires 3 to 6 hours late (B-7). #37 removed the earlier risk that a failed `down` left the database running.
6. **Are Identity, Control, Work, School and Docs ready?** **Ready with caveats** (`05`).
   - Identity and Work had a blocking bug: node-postgres verifies `sslmode=require` against RDS's private roots. It is fixed and merged (identity#5, work#28). The lead checked that the vendored bundle byte-matches AWS's published eu-central-1 bundle.
   - Platform runbook items remain for G5 to G7: the Control start order, `seed-work-roles`, `CONTROL_PLANE_TOKEN` keys, `valkey_image` and `postgres_image`, and RDS host names.
   - Docs needs a fresh image from main.
7. **Which code-only PRs were created and merged?** All four were created and merged in this phase:
   - munaxa-platform#37 → c688e9e;
   - munaxa-platform#38 → 46dfbd9;
   - munaxa-identity#5 → 4001ed8;
   - munaxa-work#28 → f812dfe.

   Each merge came only after all required checks passed on the final head, with `expectedHeadSha` pinned, using the repository's merge style. No protection was bypassed. This report PR is docs only.
8. **What remains blocked and why?** See `DECISIONS-AND-BLOCKERS.md` §2:
   - the deployer variable (B-1 there is the plan approval, now done; the variable is the new stop);
   - the bootstrap re-apply with #38 and its simulation;
   - acceptance of R1 to R10;
   - a fresh plan after the re-apply;
   - the G3 declaration PR;
   - G6 DNS within 72 h of G3;
   - `down` right after G3;
   - the Docs snapshot decision around 4 Dec;
   - the TD-13 budget;
   - product branch and tag protection;
   - platform main approvals.
9. **What exact approval is needed from Tamer next?**
   - (a) Now: correct `AWS_DEPLOYER_ROLE_ARN` (and check the prod and publisher ARNs for the same path). The lead then re-runs the read-only plan, and Tamer approves it in `aws-nonprod`.
   - (b) Then, as a separate approval: **"Approve the root re-apply of infra/aws/bootstrap at 46dfbd9 in CloudShell"**. The expected change is 19 to add, 4 real in-place, 0 destroy. It comes with setting the session role variables and running the simulation, and with formally accepting residuals R1 to R10.
10. **Is a separate G3 apply plan safe to prepare?** **Yes, to prepare; not to execute yet.** Agent 6 agrees (`06` §9). The order is in `NEXT-EXECUTION-PLAN.md`: re-apply and simulate, a fresh plan equal to the 64 creates, the declaration PR, the apply, then `down` and G6 within 72 h.

## 3. What the lead inspected directly

- The diffs of #37, #38 (both versions), identity#5 and work#28, before each merge.
- #37: an offline check that the S3 backend accepts the alias ARN as `kms_key_id` (init reached the network stage).
- #38: the patch applied on a clean `origin/main`, then fmt, validate and test re-run (8 passed at 8170e12; Agent 2 reports 9 at 0ff0879, and CI "Format, validate, mocked plan tests" passed on 0ff0879).
- The RDS CA bundle in identity#5 and work#28, against `https://truststore.pki.rds.amazonaws.com/eu-central-1/eu-central-1-bundle.pem`.
- The plan run's job steps and log, and the root cause of its failure, checked against `bootstrap/iam.tf` and the phase 4 runbook.
- `git diff --stat c688e9e 46dfbd9`: only `infra/aws/bootstrap`. The stack configuration is unchanged since the plan was dispatched.
- The report set for credentials, account e-mail and out-of-scope project names. Environment variable *names* appear; no values do.

## 4. Explicit confirmations

- **G3 was NOT applied.** The only AWS-facing operations were two read-only plan dispatches, both of which stopped at `terraform init`. Steps 7 to 9 and the apply job were skipped [V].
- **No new application infrastructure was created**, and no other AWS resource was created or changed. The S3 backend never initialised in the plan job, so not even a lock file was written [V].
- **No IAM change was applied to AWS.** #38 is code on main only [V].
- **No images were published.** The product publish workflows run only on `image/*` tags or dispatch, and none ran [V per Agent 1 and 5].
- **No secrets were written**, **no DNS or Cloudflare or certificate change** was made, **no migrations were run**, and **no Testing session was started** [V: no such workflow was dispatched; two plan dispatches in total].
- **No production change** was made, and **Render and Supabase remain untouched**: no Render or Supabase tool or API was used.
- **The retained Docs bootstrap, its final snapshot and its pending-deletion key were not touched.**
- **The AWS root connector was never used.** It was available in the session (AWS MCP) and no call was made. No IAM user or access key was created.
- **CanteenHub was not accessed**, searched for or inventoried, and no account-wide discovery was done.
