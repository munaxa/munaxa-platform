# Independent review of the G3 plan review package

- **Date:** 5 Nov 2026, about 20:15 to 20:50 UTC (container clock read 20:15:57 UTC at the start of this review).
- **Reviewer:** a separate reviewer agent. I did not write files `00` to `04` or the supporting files and did not change them. This file is the only file I created.
- **Scope:** `00-G3-PLAN-REVIEW.md` to `04-REMAINING-BLOCKERS.md` and `supporting/`, checked against `munaxa-platform` at `0c58174` (`infra/aws/stack`, `infra/aws/modules`, `infra/aws/bootstrap`, `.github/workflows/aws-terraform.yml` and `aws-session.yml`, `scripts/terraform/check-plan-intent.sh`, `scripts/aws/stop-database.sh`), earlier reports under `docs/aws-migration/agent-reports/`, the old Docs eu-prod code in `munaxa-docs` at `1f47ba4^`, and the owner's 20:00 UTC brief in this thread (read only).
- **What I re-ran myself:**
  - a fresh `git archive 0c58174 infra/aws` into my own scratch directory, with `supporting/g3-mock-harness.tftest.hcl` in place of `stack.tftest.hcl`, `terraform init -backend=false`, then `terraform test -var-file=envs/nonprod.tfvars -verbose`. Terraform 1.16.5, hashicorp/aws 6.67.0 from the local mirror. To make sure nothing could reach AWS, I unset the AWS credential variables and pointed `HTTPS_PROXY` at a dead local port;
  - the full stack test suite at `0c58174`, run the same offline way: 24 passed, 0 failed;
  - `check-plan-intent.sh --validate` on the draft declaration, plus `--enforce` against two synthetic plan JSON files. One holds the 64 addresses. The other holds the 64 plus an extra `aws_nat_gateway`;
  - `git rev-parse`, `git diff` and `git grep` for the SHA, tree and CanteenHub claims;
  - read-only GitHub REST reads. These covered the `aws-session.yml` and `aws-terraform.yml` run lists, the `main` head SHA, run 41977870108 and its jobs, and the public log of job 127080867999;
  - all cost arithmetic in `02`, recomputed by hand.
- **Not done:** no AWS call of any kind (no AWS MCP tool, no AWS CLI), no Terraform against AWS, no Cloudflare or DNS lookup, no GitHub write, no commit or push. CanteenHub was not inspected. Repository text was searched for the word only.

## Overall assessment

**AGREE WITH CHANGES.**

**I agree with the verdict `READY FOR G3 OWNER APPROVAL`**, on one condition. The owner's approval must also cover the second re-apply decision that the package leaves unrecorded (R-2). That decision can be taken in the same approval. If the owner does not accept it, the correct verdict is `NOT READY — BLOCKERS REMAIN`.

The core claims hold under independent re-execution:

- the 64 addresses, all `create`, with no update, replacement or deletion;
- the address files are byte-identical, and I now also matched them against the public job log of the real plan;
- the commit and tree SHAs;
- no NAT Gateway and no Elastic IP;
- the mocked plan's configuration;
- the draft declaration is valid and enforceable;
- the cost arithmetic.

None of my findings is Critical or High. The changes fix several problems:

- a B2 reading that claims slightly more than the owner's summary supports;
- a cost "closure" that rests on an inference;
- timestamps that cannot be right;
- a missing note that the deployer's IAM changed after the only real plan;
- an omitted recurring cost item;
- a few wording errors.

## Findings

| ID | Severity | File / section | Finding | Required change |
| --- | --- | --- | --- | --- |
| R-1 | Medium | `04` §2 (B2 record), `00` inferences row | The package says "rows 1 to 3 do not apply". Row 1 of the fixed table (`next-diagnostic/01` §5) applies on "any ERROR, fewer than 10 rows, or any C row `allowed`". That cannot be ruled out from the owner's summary: it states no values for C1, C7 or C8, gives no row count and does not say there was no ERROR. C8 (`/munaxa/nonprod/zzz`, an own-named group) is not a foreign resource, so "other tested foreign resources returned explicitDeny" does not cover it. Reading C6 into "other tested foreign resources" is the lead's interpretation [E]. Row 5 (C2 = implicitDeny) is the first match **only if** row 1 is ruled out. The final status string is the owner's decision and is not overclaimed | Reword along these lines: "Row 1 cannot be ruled out from the owner's summary (C1, C7, C8 values, the row count and the absence of ERROR are not stated). If it is ruled out, rows 2 and 3 do not apply on the reported C9, C10 and (by interpretation) C6, and row 5 is the first match." Keep `ROOT CAUSE UNRESOLVED — ACCEPTED FOR TESTING ONLY` unchanged |
| R-2 | Medium | `04` §1 and §3 (BL-3), §4 C-3; `00` §6 | Testing-readiness `04` §2 left decision **D-B** open: "Accept the second re-apply as PARTIALLY VERIFIED", recommended "Accept for Testing, with tonight's session-run check". The owner's 20:00 UTC brief does not decide D-B, and OD-1 to OD-9 do not record it. The package turns BL-3 into precondition C-3 without an owner decision. C-3 also does not say what happens if the pre-check fails | Add D-B to `04` §1 as an owner decision that is **pending and part of the G3 approval**. Make C-3's pre-check a hard stop. If `down` before G3 shows AccessDenied, or ends any way other than the expected "state key not found" notice, do not dispatch the apply. Say this in `00` §7 step 3 too |
| R-3 | Medium | `00` verdict paragraph; `04` §3 BL-14 | `00` says current spend is closed by "the owner's Cost Explorer read, which the old Docs stack explains", and BL-14 is "Closed ... explained by the old Docs stack". The amount is owner-reported [O-rep]. The attribution is an inference [E], and `02` §2 itself says it "cannot be verified without an AWS read". BL-14's original closing action was "confirm the account is near US$0 to 3 before G3". The 1 to 6 Nov total is US$5.99, and the run rate after 4 Nov is inferred, not observed | In `00`, write: "the spend is known (owner-reported); the lead infers it is mostly the retired Docs stack (not verified)". In BL-14, write: "Amount known [O-rep]; attribution [E]; not a G3 blocker by owner decision". Optional, as an owner-only read: Cost Explorer daily granularity for 5 Nov would show the post-retirement run rate directly |
| R-4 | Medium | `02` §2 (RDS row, recurring table), `00` §4 "Recurring today" | The old Docs RDS instance had `backup_retention_period = 35` and `delete_automated_backups = false` (`munaxa-docs` `1f47ba4^` `infra/terraform/eu-prod/data/rds.tf` lines 75 and 79). Retained automated backups can therefore remain, and be charged as backup storage, for up to 35 days after the 4 Nov deletion, besides the final snapshot. The package names only the final snapshot. The RDS "remainder ≈ 0.15" is attributed to "backup and final-snapshot storage" without arithmetic. Phase 5 `02` line 81 already listed these retained backups as [U] | Add "retained automated backups of `munaxa-docs-eu-prod-pg` (35-day retention, until about 9 Dec) [U: existence, size]" to the recurring table and to `02` §9. Label the RDS remainder [U] instead of naming its source. Keep the baseline range, or widen it, with that caveat |
| R-5 | Medium | `01` §1 and G-M1; `00` §3 | The only real plan (run 41977870108, head `decd1dc`, 06:04 UTC) ran **before** the second bootstrap re-apply at `6b8997a`. That re-apply changed the deployer's own policies. In `bootstrap/iam_allow.tf`, `ServiceLinkedRoles` was narrowed to ecs, elasticloadbalancing and rds, and the new denies `NoLogOrDatabaseData`, `NoExportableCertificates` and `NeverExportCertificates` were added. `bootstrap/iam.tf` added `iam:ListRoleTags` and the boundary's `NeverFromADeployerSession` and `TestingBackstop`. So the plan proves that the **earlier** deployer could plan. Nobody has yet seen the current deployer plan or create. The package names only the stack and `aws-terraform.yml` changes | State this in G-M1 and in the `00` §3 limitation column: "deployer IAM changed after this plan (second re-apply); current deployer never exercised for plan or apply". C-2 stays the check, and its stop rule should include any AccessDenied |
| R-6 | Medium | `00` and `01` headers; `supporting/g3-mocked-plan-0c58174.txt` header; `04` §3 BL-3 | The timestamps cannot be right. `00` gives "20:00 to about 21:30 UTC" and `01` gives "about 20:00 to 21:00 UTC". The mocked plan text says "~20:20 UTC", but the supporting files were written at 20:06:49 UTC and the scratch plan output at 20:02 UTC. BL-3 says "[V-gh, checked about 20:30 UTC]", but `04` was last written at 20:10:17 UTC, and the clock read 20:15 when this review began. The facts themselves held when I re-checked at about 20:16 UTC: there was no `aws-session.yml` run after 41943924455 (00:47:25 UTC), and `main` was `0c58174` | Replace the timestamps with the real times or with "before 20:10 UTC". Do not record a check at a time that has not yet happened. Cite this review's 20:16 UTC re-check if useful |
| R-7 | Low | `03` §4 DNS-M1 | It says a missing validation record makes the first `up` fail "at `aws_acm_certificate_validation` (default wait 75 minutes)". The session job has `timeout-minutes: 50` (`aws-session.yml` line 100), so it is cancelled first. The ALB does not depend on validation, so a failed `up` can leave the ALB, and possibly services, in place. The `up`-failure step stops only the database (lines 245 to 257) | Correct the wording to "cancelled at the 50-minute job timeout", and add "after a failed `up`, dispatch `down` (the ALB and services stay until then, about US$0.037 an hour or more)" |
| R-8 | Low | `01` §3 point 14 | It calls the "shared account boundary ARN" "the only prod-coupled item". `munaxa-shared-workload-boundary` is the **nonprod** boundary (`bootstrap/iam.tf` line 21: nonprod `munaxa-shared-workload-boundary`, prod `munaxa-shared-workload-boundary-prod`). For G3 that is correct and not prod-coupled. The stack hardcodes this name for every environment, which matters only for a future prod stack | Reword: "references the nonprod workload boundary by name (read-only)". Optionally note the hardcoded name as a Production follow-up |
| R-9 | Low | `01` §2 row 11 | Row 11 says "The db-admin task is the only reader of the master secret". Row 12 (and `docs.tf` lines 304 to 308) shows that `docs_db_admin_execution` also reads it | Change to "the two db-admin execution roles are the only readers" |
| R-10 | Low | `01` §2 row 59 | It says the endpoint policy "allows `s3:GetObject` on ... (ECR layers) and the two own file buckets". In the plan, the own buckets get `GetObject`, `PutObject`, `DeleteObject`, `AbortMultipartUpload` and `ListBucket` (statement `OwnFileBuckets`) | Correct the wording |
| R-11 | Low | `02` §9 and §10 | The Testing budget filters on `user:Environment$nonprod`. `bootstrap/budget.tf` lines 39 to 42 say it "reads US$0" until the owner activates `Environment` as a cost allocation tag. Whether that has been done is not stated [U]. Until it is, only the account budget watches Testing spend | Add this to §9 as [U] and add an owner check, a console read, before relying on the Testing budget |
| R-12 | Low | `01` §3 point 15 | "The only matches in the repository are earlier reports' 'do not touch' statements" is not exact. `git grep -il canteen 0c58174` gives 40 files. All of them are under `docs/aws-migration/agent-reports/`, and none are in `infra/`, `.github/` or `scripts/` (verified). But some lines record a historical open item tied to G3: phase 2 TD-11 / N-2, "where canteenhub-prod lives ... add a deny for its tag before G3". I did not trace it further, to stay out of CanteenHub scope. Phase 3 and 4 mention an N-2 project-tag deny (platform #31 and #33), which suggests it was handled | Reword to "all matches are in earlier reports; none in infra, workflows or scripts", and cite where TD-11 was closed. If it was not closed, list it as an owner-confirm item. Do not inspect CanteenHub |
| R-13 | Info | `00` §2, `01` §1 | The match with the real plan rests on [V-prior], an evidence file written by an earlier report. I extracted the 64 action/address rows from the public log of job 127080867999. All 64 are `create`, and the sorted addresses are byte-identical to my mock output and to `supporting/g3-mocked-plan-0c58174-addresses.txt`. The log also shows `MODE: --report` and the expected report-only mismatch warning | Optional: cite the job log as [V-gh] direct evidence |

## What I verified independently, and how

| Claim | Result | How |
| --- | --- | --- |
| `0c58174` = `0c58174a5088560f2fb28748f331ac604c84aaae`; `6b8997a` = `6b8997a4f9793989abfddae205b4dd6f4ed1d20c`; `decd1dc` full SHA | **Confirmed** | `git rev-parse` |
| Trees and blobs identical at both commits: stack `614a12d3…`, modules `47a9e7e0…`, `aws-terraform.yml` `9f82709e…`, `scripts/terraform` `23e7b3b9…` | **Confirmed**. `infra/aws/bootstrap` (`b83d1077…`) and `aws-session.yml` (`174e57c5…`) are also identical | `git rev-parse <commit>:<path>` at both commits |
| Only `infra/aws/README.md` and `CONTRACT.md` changed under `infra`, `.github` and `scripts` between `6b8997a` and `0c58174` | **Confirmed** (54 insertions, 20 deletions, docs only) | `git diff --stat` |
| `main` is still `0c58174`; declaration on main is `"changes": []` | **Confirmed** at about 20:16 UTC | GitHub REST `commits/main`; file read |
| Run 41977870108: `workflow_dispatch`, head `decd1dc`, created 06:03:23 UTC, plan job 127080867999 completed 06:04:42 UTC, success; "Keep the saved plan" and the Apply job skipped | **Confirmed** | GitHub REST run and job metadata |
| Real plan's 64 addresses | **Confirmed from the primary log**: `Plan: 64 to add, 0 to change, 0 to replace, 0 to destroy`; 64 rows, all `create`; sorted list `cmp`-identical to mine | Public job log via REST, rows extracted with `grep` and `sed` |
| Mocked plan at `0c58174` | **Reproduced**: `Plan: 64 to add, 0 to change, 0 to destroy`, 64 "will be created", 0 update, replace or destroy. Plan body identical to `supporting/g3-mocked-plan-0c58174.txt` except its 3-line header and the test file name. The lock file was unchanged after init, so the provider zip matched the committed `h1:` hash | Fresh archive, offline `terraform test`; `diff` |
| Address file sha256 `eb9f1844…5f79` and its byte-identity with the run evidence file, phase 7 `g3-mocked-plan-e78aa92-addresses.txt` and phase 5 `g3-expected-addresses.txt` | **Confirmed** (`cmp`). G-L3 also confirmed: phase 7 `07` line 36 quotes `…5950`, which is the suffix of `backstop-apply-mocked-addresses.txt` (`7efcc449…5950`) | `sha256sum`, `cmp` |
| Draft declaration: sha256 `d7ca102a…b56b904`; root `stack-nonprod`; 64 entries, all `["create"]`; address set equals the 64 | **Confirmed**. `--validate` prints "Declaration valid: root stack-nonprod, 64 declared change(s)". `--enforce` with `EXPECTED_ROOT=stack-nonprod` passes on the 64 and fails on 64 plus an `aws_nat_gateway` | Script runs on synthetic plan JSON |
| Terraform zip sha256 `2bc2fcff…b5e4` matches `terraform_1.16.5_SHA256SUMS`; provider zip `4ce94853…7f63` | **Confirmed** (hash values). The SUMS file's signature was not checked | `sha256sum` |
| Points 1 to 4 (64 creates, 0 update, replace or destroy) | **Confirmed** (real log and mock) | as above |
| Point 5, no NAT | **Confirmed**: no `nat_gateway` or `aws_eip` in `infra/aws` or the plan | `grep` |
| Point 6, topology | **Confirmed**: VPC `10.130.0.0/16` with DNS support and hostnames; public `10.130.0.0/24` and `.1.0/24` (1a, 1b); db `.64`, `.65`, `.66` /24 (1a, 1b, 1c); all `map_public_ip_on_launch = false`; IGW route on the public table only; db table local only; endpoint on one route table | plan text, `network.tf` |
| Point 7, security groups | **Confirmed**: ALB 80 and 443 from `0.0.0.0/0` with no egress rule in G3 (`alb_to_service` empty); database ingress 5432 from db-admin only; db-admin egress 5432 to the database and 443 out, no ingress; default SG adopted with no rules | plan text, `edge.tf`, `ops.tf`, `data.tf` |
| Point 8, RDS | **Confirmed**: `db.t4g.micro`, postgres `16`, 20 GB gp3, encrypted with the data key, managed master password with the data key, private, single AZ, deletion protection, final snapshot, 7-day backups, PI off, no `max_allocated_storage`, `rds.force_ssl = 1`, `ignore_changes = [engine_version]` | plan text, `data.tf` |
| Point 9, KMS | **Confirmed**: rotation on, 30-day window; policy exactly `AccountAdministration` (`kms:*` to account root) and `CloudWatchLogs` scoped by `kms:EncryptionContext:aws:logs:arn` to `/munaxa/nonprod/*`. G-L1 and G-L2 confirmed (log group has no `kms_key_id`; buckets use `AES256`) | plan text |
| Point 10, secrets | **Confirmed**: 10 `aws_secretsmanager_secret.service[...]`, 30-day recovery, data key; no `aws_secretsmanager_secret_version` anywhere in `stack` or `modules` | plan, `grep` |
| Point 11, roles | **Confirmed**: two execution roles, path `/munaxa-shared/`, boundary set, trust `ecs-tasks.amazonaws.com` with `aws:SourceAccount`; inline policies as described (`ops.tf` 71 to 101, `docs.tf` 294 to 323), except R-9 | code, plan |
| Point 12, images | **Confirmed**: `images = {}`; no task definition in the plan (`postgres_image` unset); stack test `an_image_tag_is_refused` exists and passes | code, test suite |
| Point 13, tags | **Confirmed in code**: `default_tags` Project, Stack, Environment, ManagedBy; budget filter `user:Environment$nonprod` (`budget.tf` 50 to 52); see R-11 | `providers.tf`, `budget.tf` |
| Point 14, no prod or cross-environment resource | **Confirmed**: all names `munaxa-nonprod…`; state key `nonprod/stack.tfstate`; `allowed_account_ids`; `environment = "nonprod"`. Wording issue R-8 | code, plan |
| Point 15, CanteenHub | **Confirmed by grep**: no match outside earlier reports. Wording issue R-12 | `git grep` |
| `aws-terraform.yml` apply safeguards | **Confirmed**: dispatch on `main` only; `--enforce` only when action is apply and the plan has changes; `EXPECTED_ROOT`; saved plan sha256 checked; same commit; `MAX_PLAN_AGE_SECONDS: '14400'`; both jobs in `aws-${env}`; nothing on push | workflow read |
| B2 script sha256 `83bdb7ac…f6d6` on disk and at `0c58174`; C1 to C10 at script lines 63 to 78 | **Confirmed** (the package says 62 to 78; line 62 is a comment) | `sha256sum`, `git show` |
| OD-1 to OD-9 match the owner's brief; Cost Explorer figures match | **Confirmed**, except that D-B is missing (R-2) | thread read |
| DNS-H1 | **Agree**. `aws_lb.main` has `count = var.edge_enabled ? 1 : 0` (`edge.tf` 67 to 79), and `down` sets it false. README G6 ("On the first session") and G7 step 2 ("first session only") say otherwise. `backstop.tf` lines 11 and 12 independently say the ALB's ARN "changes with every session". That the DNS name changes is correctly labelled [E] | code and README read |
| ACM and Cloudflare details in `03` | **Consistent with code**: certificate `*.test.munaxa.com` plus SAN `operator-test.munaxa.com`, DNS validation; HTTPS listener uses `aws_acm_certificate_validation.main[0]` (`edge.tf` 111); outputs not printed (`aws-session.yml` 235). The 72-hour ACM rule and the Cloudflare Universal SSL depth are external facts I could not check offline | code read |

**Cost arithmetic (`02`), recomputed:**

- The owner's lines sum to **5.9893**. The 00 rounding is correct.
- **ELB:** 2.1334 / 0.027 = 79.01 h, consistent with 79 billed ALB-hours plus about US$0.0004 of LCU.
- **VPC:** 0.7890 / 0.005 = 157.8 IPv4-hours, which is 2 × 78.9 h. No ECS line appears, so old Docs tasks were not running, and the two ALB addresses are a plausible source.
- **Secrets:** 0.1319 × 720 / 0.40 = 237.4 secret-hours, which is 3 × about 79 h.
- **KMS:** 0.4153 × 720 = 299 key-hours. This is a useful cross-check the package uses only implicitly. Two continuing keys at about 110 h plus the Docs data key at 80 h fit only if the Cost Explorer data ran to about midday on 5 Nov. In that case the ELB, VPC and Secrets figures, which stop at about 79 h, do suggest those resources had stopped charging. Each step is still [E].
- **G3 idle:** 2.74 + 1 + 4.40 + 0.50 = 8.64, consistent with "about 8.7". Worst-case restarts: 4 × 24 × 0.019 = 1.82.
- **Session rates:**
  - Identity + Control: 0.0568 + 0.035 + 0.025 + 0.019 = 0.136.
  - Adding Work: 0.0852 + 0.035 + 0.035 + 0.019 = 0.174.
  - Every service: 3.0 vCPU and 9 GB, which matches `services.tf`, `docs.tf` and the module defaults: 0.186 + 0.035 + 0.06 + 0.019 = 0.30.
- **Month scenarios:** 15 to 17, 19 to 21 and 42 to 44 are all correct.
- **Headroom:** 38 / 0.17 = 224 h and 38 / 0.30 = 127 h.
- **Accident table:**
  - database only: 0.46 a day, 13.7 a month;
  - stage 2 session: 4.1 a day, about 123 to 125 a month;
  - every service: 7.2 a day, about 216 to 219 a month;
  - ALB only: 0.037 an hour, 0.89 a day, about 27 a month.
- **Budget figures:** 124 / 50 ≈ 2.5 times the budget, and idle is 23 % of US$50.

All of these are correct to the stated rounding. The attributions are labelled [E] in `02`, but not in the `00` verdict paragraph or BL-14 (R-3).

## Labelling discipline

- **Mostly good.** `01` and `02` use [V-repo], [V-gh], [L], [V-prior], [O-rep], [E] and [U] consistently. The mock's limits are stated plainly: it is not AWS, IAM documents are placeholders, and ARN-dependent values show as known after apply. B2 never claims to show real AWS authorization behaviour.
- **Weak points.** These are R-1 (a reading stated more firmly than the owner's summary allows), R-3 (an inference used to close a blocker), R-2 (a decision treated as made when the owner has not made it) and R-6 (timestamps).

## Limitations: what nobody could verify without AWS access

- **The real plan's attribute values.** The public log prints only addresses and actions, and the saved plan was not kept. No real plan exists at `0c58174` or at the future declaration commit.
- **The current deployer.** Whether it can plan and create every one of the 64 resources after the second re-apply, including service-linked role availability for RDS and ECS, and whether its live policies equal the `6b8997a` render. The second re-apply is still PARTIALLY VERIFIED.
- **The session trust path.** Whether the session roles still assume correctly after the second re-apply. No `aws-session.yml` run has happened since 00:47 UTC on 5 Nov.
- **B2.** The raw JSON output of the 10-call diagnostic, in particular the C1, C7 and C8 values and whether any row was ERROR, and therefore whether row 1 applies. Also how AWS actually authorizes `logs:GetLogEvents` on `/aws/*` for the deployer.
- **Cost.**
  - The split of the owner's figures by usage type and resource, and therefore every attribution in `02` §2.
  - Whether the old Docs retained automated backups and the final snapshot exist, their sizes and their monthly cost.
  - Whether any Route 53 hosted zone remains.
  - Whether `Environment` is an active cost allocation tag.
  - Whether ECS task IPv4 charges are tagged.
  - That KMS keys and secrets pending deletion are not charged, which rests on the earlier price read.
- **Cloudflare and DNS.** CAA records for `munaxa.com`, the Cloudflare Access configuration, and the ACM 72-hour behaviour as it applies on the day.
- **Repository settings.** The GitHub environment protection on `aws-nonprod` and `aws-nonprod-session`, and the environment-scoped role variables. These were not read here.
