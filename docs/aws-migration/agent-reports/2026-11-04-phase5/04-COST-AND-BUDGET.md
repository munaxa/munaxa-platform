# Phase 5, Agent 4: cost and budget verification (4 Nov 2026)

Labels: **[V]** directly verified (how is stated), **[P]** priced: a list price read from the AWS public
Price List for eu-central-1 (a sub-type of [V] for the unit price only; the quantity may still be [E]),
**[E]** estimated, **[R]** recommended, **[U]** unverified or inaccessible, **[O]** owner action required.

Read-only. No AWS credentials, no AWS MCP connector, no AWS CLI, no workflow dispatch, no budget,
billing or resource change, no push. Cost Explorer and Budgets could not be read, so **no live charge
in this report is measured** except where a dated earlier measurement is cited.

## 0. Sources

| Source | Identity |
| --- | --- |
| munaxa-platform `origin/main` | `00667f31493b1e8ba4380ddc3f49efce3abffc11` (2026-11-04 09:55 UTC, #36) [V git] |
| munaxa-docs `origin/main` | `b8c7e252bb6292f74eba3cb88dcb8a1a5f24a6f9` (#174) [V git] |
| Prices | AWS Price List bulk API, `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/<svc>/current/eu-central-1/index.json` (Route 53, Budgets: global), fetched **2026-11-04 10:06 UTC**; publication dates 2026-09-11 to 2026-11-03 per file (`evidence/04/pricelist-files.txt`, extracted lines `evidence/04/eu-central-1-prices.txt`) [V] |
| Billing rules | aws.amazon.com/kms/pricing, /vpc/pricing, /ecr/pricing, /rds/postgresql/pricing, /secrets-manager/pricing and faqs, docs.aws.amazon.com RDS `USER_StopInstance.html`, read with WebFetch 2026-11-04 ~10:10 UTC [V page text as summarised by the fetch tool] |
| Old Docs teardown | munaxa-docs runs 41786425002, 41787804456, 41788878315, 41794933464, 41797685617 (timestamps and log excerpts in `evidence/04/`) [V GitHub API / job logs] |
| Session backstop | munaxa-platform workflow 401364664 (`aws-session.yml`) run list (`evidence/04/aws-session-runs.tsv`) [V GitHub API] |
| Measured cost | 29 Oct 2026 Cost Explorer reading in project memory (`munaxa-aws-cost-and-phase1a.md`): old Docs idle ≈ US$1.55/day; October spend US$7.40 (`munaxa-ecosystem-state.md`) [V on that date by an earlier agent; U since] |

Calculation script and output: `evidence/04/model.py`, `evidence/04/model-output.txt`.

## 1. Unit prices, eu-central-1 [P]

| Item | Price | Note |
| --- | --- | --- |
| Fargate x86 | US$0.04656 per vCPU-h, US$0.00511 per GB-h | ARM64: 0.03725 / 0.00409; 20 GB ephemeral included |
| Public IPv4 (in use or idle) | US$0.005 per address-h | no IPv4 free tier stated on the VPC page |
| ALB | US$0.027 per h (or partial h) + US$0.008 per LCU-h | |
| RDS PostgreSQL db.t4g.micro | Single-AZ US$0.019/h; Multi-AZ US$0.037/h | db.t4g.small US$0.037/h |
| RDS gp3 storage | US$0.137 per GB-month | billed while stopped (RDS docs) |
| RDS backup storage beyond free allocation | US$0.103 per GB-month | includes manual snapshots |
| KMS customer managed key | US$1 per key-month (symmetric and asymmetric alike) | **no charge while scheduled for deletion**; first and second rotation add US$1/month each (from year 2), capped |
| Secrets Manager | US$0.40 per secret-month | deletion-window billing not stated on pricing page or FAQ [U] |
| Route 53 hosted zone (Cloud Map private namespace) | US$0.50 per month | |
| Cloud Map registered resource | US$0.10 per resource-month | |
| Interface VPC endpoint | **US$0.012 per endpoint-AZ-h** | US$17.52/month for 2 AZ. `network.tf` comment says US$0.01 / US$14.60: stale |
| ECR storage | US$0.10 per GB-month | same-region pulls free |
| S3 Standard | US$0.0245 per GB-month; PUT US$0.0054 per 1,000 | |
| CloudWatch Logs | ingest US$0.63/GB; storage US$0.0324/GB-month | |
| Data transfer | out US$0.09/GB after global free tier; cross-AZ US$0.01/GB | |
| ACM public certificate | US$0 | |
| AWS Budgets (no actions) | **US$0 per budget-day** | phase 3/4 "0 to 1.24 for budgets" was wrong; only action-enabled budgets cost money after 62 budget-days |
| CloudTrail management events, first copy | US$0 | |

The 29 Oct measurement agrees with these prices: old Docs ALB US$19.71 = 730 h × 0.027, IPv4 US$7.30 = 2 × 730 × 0.005,
RDS US$13.87 = 730 × 0.019, storage US$2.74 = 20 GB × 0.137 [V arithmetic].

## 2. Budgets

| Budget | Scope / filter | Limit, alerts | Code | Live |
| --- | --- | --- | --- | --- |
| `munaxa-shared-testing-monthly` | `TagKeyValue` = `user:Environment$nonprod` | US$50; 80 % ACTUAL, 100 % FORECASTED | [V] platform `bootstrap/budget.tf` | name and 50.0 listed after G2 [V, G2-EXECUTION-REPORT §6, owner-pasted CloudShell output, 31 Oct]; filter value live [U] |
| `munaxa-shared-account-monthly` | whole account | US$50; 80 % ACTUAL, 100 % ACTUAL, 100 % FORECASTED | [V] same file | name and 50.0 [V, same report] |
| `munaxa-account-monthly` (Docs bootstrap) | whole account | US$10; 80 % ACTUAL, 100 % FORECASTED | [V] munaxa-docs `bootstrap/budget.tf`, default 10 | present 31 Oct [V, G2 stage-1 listing]; limit 10 seen in Phase 0 [reported] |
| `munaxa-docs-eu-prod-monthly` (Docs bootstrap) | `user:Environment$Production` | US$10; 80 %, 100 % ACTUAL, 100 % FORECASTED | [V] same file | present 31 Oct [V, same listing] |

Cost allocation tags `Environment` and `Project` were activated 2026-10-31 13:43:41 UTC [V as reported in phase 4 G2-EXECUTION-REPORT §9,
CLI output `Errors: []` then both Active; not re-checked, U now]. Activation is not retroactive.

Findings:

1. **The Testing budget undercounts Testing.** The platform bootstrap's default tags have no `Environment` key [V `bootstrap/providers.tf`],
   so the state key, state bucket and 11 ECR repositories are outside the Testing filter. Public IPv4 on ECS-managed task ENIs, data transfer
   and secrets the owner creates in the console (one-run bootstrap secrets) are probably untagged too [U]. IPv4 alone is about 20 % of a
   session hour. The **account budget is the real backstop**; with old Docs gone both are US$50, so they will alert at nearly the same time.
2. **TD-13: the Docs US$10 account budget will alert every month after G3** (fixed cost alone is US$11 to 20, §4) and its forecast alert can
   fire early in the month. That is alert noise, not a cost. Only the owner can change it, as root through the Docs bootstrap [O].
   Recommended: raise it to 50 or remove it, and remove `munaxa-docs-eu-prod-monthly` once the final snapshot is gone [R].
3. Budgets only notify; none has an action that stops anything [V code]. Billing data lags by hours to a day, so an 80 % ACTUAL alert means
   roughly US$40 already spent [E].
4. The Testing budget has no 100 % ACTUAL notification (the account budget has) [V code]. A small gap; the account budget covers it.
5. Whether the AWS Free Tier credits for new accounts apply to this account (management account of an organization) and whether
   budgets net them is unknown [U]. Every figure below is gross list price.

## 3. Charges outside the Testing stack, now

### 3a. Shared platform bootstrap (G2, 31 Oct)

| Item | US$/month | Label |
| --- | --- | --- |
| KMS key `alias/munaxa-shared-tfstate` (rotation on; first rotation 2027-10-31) | 1.00 (2.00 from Nov 2027) | [P]; key existence [V G2 report] |
| S3 state bucket (versioned, KB-sized) | < 0.01 | [P], size [E] |
| 11 ECR repositories, empty until G5 | 0; after G5 about 0.30 to 1.50 (images of 150 to 400 MB, 1 to 3 kept per repository early on; the lifecycle rule allows 20 tagged per repository, which could reach several GB later) | [P] price, [E] size |
| 2 budgets, IAM roles, policies | 0 | [P], IAM free |
| **Total** | **≈ 1.00 now** | |

### 3b. Retained Docs bootstrap and teardown leftovers

| Item | US$/month | Label |
| --- | --- | --- |
| Docs state KMS key (`prevent_destroy`) | 1.00 | [P]; kept [reported, OLD-DOCS-RETIREMENT; code V] |
| Docs state bucket | < 0.01 | [E] |
| Docs ECR `munaxa-docs/{api,web,antivirus}` (old images, keep 20) | 0 to 1.00 | [U] size; the Testing stack pulls Docs images from these repositories, so they stay |
| CloudTrail multi-region trail into an S3 bucket, 365-day expiry | 0.05 to 0.80 (log storage plus S3 PUTs for file delivery across regions) | [P] prices, [E] volume |
| Docs budgets, OIDC provider | 0 | [P] |
| Final snapshot `munaxa-docs-eu-prod-pg-final` | 0.10 to 2.06 (US$0.103 per GB of snapshot data; 20 GB allocated is the ceiling; actual data size unknown) | [V] created: run 41788878315 deleted `aws_db_instance.main` 07:33:30 UTC 4 Nov with that `final_snapshot_identifier`; [U] size. No RDS instance exists in the region now, so no free backup allocation offsets it. After G3 the nonprod 20 GB instance may provide one [U while stopped] |
| Docs data KMS key `9758d15e-…`, scheduled for deletion | **0** | [V] scheduled 2026-11-04 08:21:19 UTC (run 41797685617, `deletion_window_in_days = 30`, so deletion ≈ **2026-12-04 08:21 UTC**); [P] no charge while pending. Phase 4's "costs a little" is corrected |
| **Total** | **≈ 1.15 to 4.90; likely ≈ 1.5 to 2.5** | [E] |

**[O] by about 4 Dec:** after the key is deleted the snapshot cannot be restored **but is still billed** until someone deletes it. Delete the
snapshot, or cancel the key deletion if it must be kept (then the key costs US$1/month again).

### 3c. November 2026 so far [E]

Old Docs ran until 4 Nov: ALB destroyed 06:52:57 UTC (run 41787804456), RDS 07:33:30 UTC [V logs]. About 79 hours of ALB, 2 public IPv4,
RDS and storage ≈ **US$4.70**, plus prorated KMS and secrets. November's account total should be roughly US$5 (old Docs) + US$2 to 3
(bootstraps) + whatever G3 and sessions add. Not measured [U]. [R] read Cost Explorer for 1 to 5 Nov with a suitable identity to
confirm the step down.

## 4. G3 idle cost (persistent layer only)

What G3 creates, from code [V `stack/*.tf` at `00667f3`, `envs/nonprod.tfvars`]: VPC, IGW, 2 public + 3 isolated subnets, route tables, S3
**gateway** endpoint (free), **no NAT, no interface endpoint**, 1 db.t4g.micro **Single-AZ**, 20 GB gp3, backups 7 days, Performance Insights
off, not public; data KMS key; 10 secret bundles (8 product + docs-api + docs-operator, because `hosts.docs` is set) + the RDS-managed master
secret; Cloud Map private namespace; ECS cluster (Container Insights off); 2 S3 file buckets (school, docs, empty); ACM certificate; log group
`/munaxa/nonprod/ops` (14 days). No ALB, no service, no task, so **no public IPv4** while idle. The Control licence key is created only once a
Control image is set (G5), not at G3.

| Item | US$/month | Label |
| --- | --- | --- |
| RDS storage 20 GB gp3 (billed while stopped) | 2.74 | [P] |
| RDS automated backup storage (≤ 20 GB, within the free allocation) | ≈ 0 | [E]; [U] whether the allocation applies while stopped |
| RDS 7-day auto-restart: RDS starts itself after 7 stopped days, then runs until the next scheduled `down` | 0 to 2.50 (about 4 restarts a month × 12 to 30 h × 0.019); 0 if a session runs at least weekly | [E] |
| KMS data key | 1.00 | [P] |
| Secrets: 11 × 0.40 | 4.40 | [P] |
| Route 53 private zone (Cloud Map) | 0.50 | [P] |
| S3 file buckets (empty), CloudWatch log storage (14 days), ACM, VPC, cluster, gateway endpoint | ≈ 0 | [P]/[E] |
| **Testing idle** | **8.64 to 11.14** | |
| After G5: licence key (asymmetric, US$1) and ECR image storage | + 1.30 to 2.50 | [P]/[E] |

README (`infra/aws/README.md` cost section) said about US$13 idle "from memory"; it is now priced and slightly lower. Its line "the
Docs Production idle stack (about US$48 a month) is in the same account" and CONTRACT §10's equivalent sentence are **stale** since
4 Nov [V text vs. retirement logs].

## 5. Active session cost per hour

All 10 services at one task each (sizes [V] in `services.tf`, `docs.tf`, module default 256/512 for portal and admins):

| Service | vCPU | GB |
| --- | --- | --- |
| identity (+ Valkey sidecar inside the task) | 0.5 | 1 |
| control-api, control-portal, work-api, work-admin, school-api, school-admin | 0.25 each | 0.5 each |
| docs-api (+ Redis sidecar) | 0.5 | 2 |
| docs-web | 0.25 | 1 |
| docs-scanner | 0.25 | 2 |
| **Total** | **3.0** | **9.0** |

| Item | US$/h | Label |
| --- | --- | --- |
| Fargate x86: 3 × 0.04656 + 9 × 0.00511 | 0.1857 | [P] |
| Public IPv4: 10 tasks + 2 ALB nodes = 12 × 0.005 | 0.060 | [P] price, [E] ALB node count at low load |
| ALB hour | 0.027 | [P] |
| ALB LCU, 0.1 to 1 LCU at test traffic | 0.001 to 0.008 | [E] |
| RDS db.t4g.micro running | 0.019 | [P] |
| CloudWatch Logs ingest (10 to 50 MB/h; the 5 GB monthly free allowance may absorb it) | 0 to 0.03 | [E] |
| Data transfer (ECR pulls same region and via the S3 gateway: free; internet out within free tier; cross-AZ RDS small) | ≈ 0 to 0.01 | [E] |
| Secrets/KMS API calls, Cloud Map instances (4) | < 0.001 | [P] |
| **Per session hour** | **0.29 to 0.34, central 0.31** | |
| Same without the three Docs services (7 tasks, 2 vCPU, 4 GB, 9 IPv4) | ≈ 0.22 | [E] |

Run-only tasks (db-admin, migrations, bootstraps) add a public IPv4 and a few Fargate minutes each: cents [E]. The ALB is billed per started
hour, so a session of 10 minutes costs a full ALB hour [P wording "or partial hour"].

## 6. Monthly scenarios (account total after G3, US$) [E]

Fixed part = Testing idle + shared bootstrap + Docs bootstrap + final snapshot (+ licence key and ECR after G5).

| Case | Fixed | Idle only | + 20 h | + 40 h | + 80 h | Session hours that fit in US$50 |
| --- | --- | --- | --- | --- | --- | --- |
| Low (no auto-restart hours, small snapshot, before G5) | 10.84 | 10.84 | 16.69 | 22.54 | 34.24 | ≈ 134 |
| Central | 14.34 | 14.34 | 20.45 | 26.57 | 38.79 | ≈ 117 |
| High (full auto-restart cycles, 20 GB snapshot, large ECR, verbose logs) | 19.50 | 19.50 | 26.29 | 33.09 | 46.67 | ≈ 90 |

After the snapshot is deleted (≈ 4 Dec) the fixed part drops by US$0.10 to 2.06. **Conclusion: US$50 holds with up to about 90 session hours
a month in the worst estimate and about 117 in the central one.** The phase 2 to 4 figure of "about 120 hours" stands, now priced.

## 7. What could push the month over US$50

| # | Design or failure | Extra cost | Where the design stands | Label |
| --- | --- | --- | --- | --- |
| 1 | **A session not torn down** | ≈ US$7.30 per forgotten day; US$223/month if left on. From the central fixed cost, US$50 is reached in **about 5 days** | Only backstop is the 20:00 UTC cron. **Observed scheduled runs started 3 h 11 min to 6 h 04 min late** (23:11 to 02:04 UTC, runs 41144903826 … 41747107325). A session started just after the backstop can run about 24 to 30 h. GitHub disables schedules in a public repository (munaxa-platform is public [V API]) after 60 days without activity [E]. The `down` job stops RDS only if plan and apply succeed | [V] runs, [E] cost |
| 2 | **The backstop is currently inactive** | all of #1 and #3 | Every scheduled run so far concluded `skipped` because the job's `if` needs `vars.AWS_CI_ROLE_ARN` [V runs]. The repository variables from G2 step 4 are not set yet (also reported in phase 4) | [V] |
| 3 | **RDS left running** (after the G3 apply, after an auto-restart, or after a failed `down`) | US$13.87/month full time | `aws-terraform.yml` has no RDS stop [V grep]; the G3 apply leaves the new instance running until a `down` runs. Fixed cost would become US$24 to 33, so only 50 to 85 session hours fit | [V] code, [P] |
| 4 | 7-day RDS auto-restart | up to ≈ US$2.50/month | Covered by the nightly `down` once it is active; the stop step runs only when status is `available`, so an instance still `starting` at that moment runs another day [V code] | [E] |
| 5 | ALB left on between sessions | US$27/month (ALB + 2 IPv4) | `edge_enabled = false` between sessions destroys it; deletion protection off in nonprod [V code] | [V] |
| 6 | Multi-AZ | +US$13 running per month, and double storage | `multi_az = false` [V code] | [V] |
| 7 | Interface endpoints | US$17.52 per endpoint; the four a private-subnet design needs ≈ US$70/month | none; S3 gateway only [V code] | [P] |
| 8 | NAT gateway | ≈ US$38/month + per GB | none [V code] | [E] (price not in the downloaded offer files) |
| 9 | Log volume | US$0.63/GB ingest | retention 14 days bounds storage [V]; a crash-looping, verbose service can still ingest GBs in a long session [E] | [E] |
| 10 | ECR growth | US$0.10/GB-month | lifecycle keeps 20 tagged images per repository, 14 repositories; tens of GB possible over months [E] | [E] |
| 11 | Larger desired counts or task sizes in nonprod | linear | `desired_counts` all 1 in `nonprod.tfvars` [V] | [V] |
| 12 | Forgotten final snapshot after 4 Dec | ≤ US$2.06/month, indefinitely | owner action pending | [O] |

## 8. Least expensive safe configuration [R]

The current code is already the least expensive design that keeps the security model: no NAT, no interface endpoint, Single-AZ micro RDS
stopped between sessions, ALB and services created only per session, 14-day logs, free budgets, ECR lifecycle. What is missing is
operational, not architectural:

1. **[O] Before G3, set the GitHub variables from G2 step 4** (`AWS_CI_ROLE_ARN`, `AWS_DEPLOYER_ROLE_ARN`) after creating the protected
   environments, so the nightly `down` actually runs. Until then there is no cost backstop for the database at all.
2. **[R] Right after the G3 apply, dispatch `aws-session.yml down`** (or add that to the README G3 runbook), so the new instance is stopped the
   same day rather than at the next scheduled run.
3. **[R] Do not rely on the 20:00 UTC timing.** Treat each session as "dispatch `down` when done". Optionally a small PR could add a second
   schedule (for example 23:00 UTC) and a stop of the database even when the apply fails; either is a change to a protected workflow and needs
   review, so it is only a proposal here.
4. **[R] Run sessions at least weekly or accept the auto-restart cost**; the nightly `down` re-stops an auto-started instance once it is active.
5. **[O] Retire or raise the Docs US$10 account budget (TD-13)** and **delete the final snapshot by 4 Dec** (or cancel the key deletion).
6. **[R] Optional savings that keep security unchanged:** sessions without Docs save ≈ US$0.09/h (needs a separate Docs switch, phase 2
   item 3); ARM64 Fargate saves ≈ US$0.04/h (needs ARM images, and the scanner image must support it); Fargate Spot for nonprod services
   (the cluster already lists `FARGATE_SPOT`, but services use `launch_type = FARGATE`) would cut the Fargate share further, at the cost of
   interruptions. None is needed to stay under US$50.
7. **[R] Correct the stale text** when convenient: the README cost section and CONTRACT §10 (old Docs "in the same account"; "prices from
   memory"), and the `network.tf` endpoint price (US$0.012, not 0.01, per AZ-hour).
8. **[R] After G3, read Cost Explorer once** (1 to 7 days after) with a suitable non-root identity, to replace these estimates with
   measurements and check that `user:Environment$nonprod` attributes the stack.

Nothing in this phase changed a budget, a billing setting, a resource or a workflow.
