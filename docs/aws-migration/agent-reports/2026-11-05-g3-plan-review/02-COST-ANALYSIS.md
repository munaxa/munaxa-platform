# Cost analysis: actual charges and projected Testing costs

- **Date:** 5 Nov 2026, evening (UTC). **Author:** the lead of this thread.
- **Scope:** read-only. **No AWS call was made in this task** (the owner forbade the root connector). Actual figures are the owner's Cost Explorer read; resource timing comes from GitHub run metadata and Terraform code; unit prices are those read from the public AWS Price List files for eu-central-1 in `2026-11-05-testing-readiness/03` §10 (not re-downloaded here).
- **Rule:** the six-day period is **not** extrapolated into a monthly forecast. The US$50 Testing budget is a target, not a guarantee.

| Label | Meaning |
| --- | --- |
| [O-rep] | owner-reported AWS figure (Cost Explorer, read by the owner as root, 5 Nov) |
| [V-gh] / [V-repo] | GitHub run metadata / git content read in this task |
| [V-price-prior] | unit price read from the AWS Price List in `2026-11-05-testing-readiness/03` §10 |
| [E] | estimate or inference |
| [U] | cannot be verified without an AWS read |

## 1. Verified actual charges [O-rep]

Identity `arn:aws:iam::229251310592:root`; Cost Explorer API in `us-east-1` (the billing endpoint; infrastructure stays in `eu-central-1`); period **1 to 6 November 2026**.

| Service | USD |
| --- | --- |
| Elastic Load Balancing | 2.1334 |
| Amazon RDS | 1.9641 |
| Amazon VPC | 0.7890 |
| Amazon Route 53 | 0.5000 |
| AWS KMS | 0.4153 |
| AWS Secrets Manager | 0.1319 |
| Amazon ECR | 0.0387 |
| Amazon S3 | 0.0169 |
| AWS CloudTrail, AWS Glue, Amazon CloudWatch, Tax | 0.00 each |
| **Total** | **5.9893** (the lines sum to this; "about US$5.99") |

**Caveats [E]:** Cost Explorer end dates are exclusive, and the read was taken on 5 Nov, so the period covers 1 Nov to the latest processed hour of 5 Nov; Cost Explorer lags by up to about a day. The metric (unblended or amortised) was not stated [U]; for on-demand usage they are equal.

## 2. Where the charges come from

**The old Docs eu-prod stack ran until the morning of 4 Nov** [V-gh, munaxa-docs `terraform-eu-prod.yml`]:

| Run | Root | Started | Ended | Result |
| --- | --- | --- | --- | --- |
| [41787804456](https://github.com/munaxa/munaxa-docs/actions/runs/41787804456) | service (ALB, listeners, certificate, ECS, **Cloud Map namespace**, 2 secret containers; 26 deletes) | 4 Nov 06:46:52 | 06:53:29 | success |
| [41788878315](https://github.com/munaxa/munaxa-docs/actions/runs/41788878315) | data (RDS `db.t4g.micro` 20 GB with final snapshot, bucket; 15 of 17 deletes) | 06:56:50 | 07:33:36 | failure (KMS key left, finished by 41797685617 at 08:21) |
| [41794933464](https://github.com/munaxa/munaxa-docs/actions/runs/41794933464) | core (VPC, subnets, endpoint, SGs, roles; 59 deletes) | 07:49:25 | 07:55:04 | success |

From 1 Nov 00:00 to 4 Nov about 06:50 UTC is **about 78.8 to 78.9 hours**. The charges match that window closely:

| Service | Arithmetic [E] | Source [E] | Recurs? |
| --- | --- | --- | --- |
| **ELB 2.1334** | 2.1334 ÷ US$0.027 per ALB-hour = **79.0 hours**; LCU charge ≈ 0 | The old Docs ALB, deleted by run 41787804456 | **No** |
| **VPC 0.7890** | 0.7890 ÷ US$0.005 per IPv4-hour = 157.8 = **2 addresses × 78.9 hours** | The ALB's two public IPv4 addresses | **No** |
| **RDS 1.9641** | instance 79.5 h × US$0.019 ≈ 1.51; storage 20 GB × US$0.137 × 79.5/720 ≈ 0.30; remainder ≈ 0.15 | The old Docs database (deleted in run 41788878315), plus backup and final-snapshot storage | **Partly:** the final snapshot `munaxa-docs-eu-prod-pg-final` keeps charging until deleted (owner action about 4 Dec); the old code also kept **retained automated backups** (`delete_automated_backups = false`, 35-day retention, munaxa-docs `1f47ba4^` `data/rds.tf` lines 75, 79), which may charge until they expire [U: size, rate, and the split of the 0.15 remainder] |
| **Route 53 0.5000** | one hosted zone month (charged in full for any zone that exists in the month) | The old Docs **Cloud Map private namespace** (a private hosted zone; munaxa-docs `eu-prod/service/ecs.tf` 125), present on 1 Nov | **No, unless another hosted zone exists** [U]. G3 adds one (row in §4) |
| **KMS 0.4153** | ≈ 299 key-hours at US$1 per 720 h | Two continuing keys (shared bootstrap state key; Docs bootstrap state key, munaxa-docs `bootstrap/main.tf` 18) plus the old Docs data key until its deletion was scheduled (4 Nov 08:21). 2 × about 110 h + 80 h ≈ 300 key-hours | **Yes, about US$2 a month** (the two state keys). A key pending deletion is not charged [V-price-prior] |
| **Secrets Manager 0.1319** | ≈ 237 secret-hours at US$0.40 per 720 h = **3 secrets × 79 hours** | The old Docs 2 app secret containers and its RDS-managed master secret, deleted on 4 Nov (30-day recovery window) | **No** [E]. The figure is consistent with no charge during the recovery window; not confirmed from a price page in this task [U] |
| **ECR 0.0387** | ≈ 0.39 GB-month in about 5 days ⇒ about 2.3 GB stored | Docs images in the Docs bootstrap's `munaxa-docs/*` repositories (the shared repositories hold no image) | **Yes, about US$0.2 to 0.3 a month** |
| **S3 0.0169** | | State buckets, CloudTrail bucket | Yes, cents |
| CloudTrail, CloudWatch, Glue 0.00 | | First trail free; no paid log volume; Glue line has no charge [U why it appears] | |

**Conclusion [E]:** about **US$5.4 of the US$5.99 (ELB, VPC, most of RDS, Route 53, Secrets) came from the old Docs stack before its retirement on 4 Nov and does not recur.** Nothing in the figures suggests a Testing or other live workload resource. This is an inference from timing and unit prices; it **cannot be verified without an AWS read** (for example Cost Explorer grouped by usage type, or the Billing console by resource).

### Existing recurring charges after 4 Nov [E]

| Item | US$ a month |
| --- | --- |
| Shared bootstrap state KMS key | 1.00 |
| Docs bootstrap state KMS key | 1.00 |
| ECR storage (Docs images) | 0.2 to 0.3 |
| S3 (state, trail) | about 0.1 |
| Docs final snapshot and retained automated backups (until deleted or expired) | [U], small for a 20 GB database |
| Route 53 in December | 0.50 only if a hosted zone still exists [U] |
| **Baseline before G3** | **about US$2.5 to 3** |

## 3. Unit prices used [V-price-prior]

eu-central-1, on-demand list prices, from the Price List files read on 5 Nov in `2026-11-05-testing-readiness/03` §10: Fargate US$0.04656 per vCPU-hour and US$0.00511 per GB-hour; RDS PostgreSQL `db.t4g.micro` Single-AZ US$0.019 per hour; RDS gp3 US$0.137 per GB-month; ALB US$0.027 per hour and US$0.008 per LCU-hour; public IPv4 US$0.005 per hour; Secrets Manager US$0.40 per secret-month; KMS US$1 per key-month; ECR US$0.10 per GB-month; CloudWatch Logs US$0.63 per GB ingested, US$0.0324 per GB-month stored; Route 53 hosted zone US$0.50 per month. NAT Gateway price **not used**: there is none (it would be about US$0.05 an hour plus data processing in this Region [E], over US$35 a month for one gateway).

## 4. G3 idle cost (no session, database stopped) [E]

| Component | Basis | US$ a month |
| --- | --- | --- |
| RDS storage | 20 GB gp3 × 0.137 (charged while stopped) | 2.74 |
| RDS backups | 7 days; free up to the provisioned size [E] | about 0 |
| RDS instance | stopped: 0; **but** AWS restarts a stopped instance after 7 days; the nightly `down` (and later the backstop) stops it again | 0 to about 1.8 (worst case 4 restarts × up to 24 h) |
| KMS data key | 1 key | 1.00 |
| Secrets | 10 bundles + the RDS master secret = 11 × 0.40 | 4.40 |
| Route 53 | Cloud Map private zone `nonprod.munaxa.internal` | 0.50 |
| CloudWatch Logs | ops log group, 14-day retention, near-empty | under 0.10 |
| S3 file buckets | empty | about 0 |
| VPC, subnets, IGW, routes, SGs, S3 gateway endpoint, ECS cluster, ACM certificate | no charge | 0 |
| Public IPv4 | none while idle (no ALB, no task) | 0 |
| **G3 increment** | | **about US$8.7** (up to about 10.5 with RDS restarts) |
| **Account total idle after G3** (with the §2 baseline) | | **about US$11 to 12** (13 to 14 with restarts) |
| After Config A (Control licence KMS key, `prevent_destroy`) | +1 key; ECR images +0.2 to 0.5 | about US$12.5 to 13.5 |

**Right after the G3 apply** the database is **running** (it is created running) at US$0.019 an hour until `down` stops it.

## 5. On-demand session cost per hour [E]

Task sizes from `services.tf` and `docs.tf` [V-repo]: identity 0.5 vCPU / 1 GB; control-api, control-portal, work-api, work-admin 0.25 vCPU / 0.5 GB each.

| Session | Fargate | ALB + LCU | Public IPv4 | RDS | **Per hour** |
| --- | --- | --- | --- | --- | --- |
| Identity + Control | 1.0 vCPU, 2 GB: 0.057 | 0.035 | 5 × 0.005 = 0.025 | 0.019 | **about 0.14** |
| + Work (recommended first product sequence ends here) | 1.5 vCPU, 3 GB: 0.085 | 0.035 | 7 × 0.005 = 0.035 | 0.019 | **about 0.17** |
| Every service incl. School and Docs | 3.0 vCPU, 9 GB: 0.186 | 0.035 | 12 × 0.005 = 0.06 | 0.019 | **about 0.30** |

## 6. A normal Testing month [E]

| Scenario | Idle | Sessions | RDS restarts | **Total** |
| --- | --- | --- | --- | --- |
| Light: 20 session-hours, Identity + Control + Work | 12 | 3.4 | 0 to 1.8 | **about US$15 to 17** |
| Normal: 40 session-hours, same | 12 | 6.8 | 0 to 1.8 | **about US$19 to 21** |
| Heavy: 100 session-hours, every service | 12 | 30 | 0 to 1.8 | **about US$42 to 44** |
| Budget headroom | US$50 − about 12 idle | | | about **220 hours** at 0.17, about **125 hours** at 0.30 |

## 7. Leaving resources running by accident [E]

| What is left running | Per hour | Per day | Per 30-day month |
| --- | --- | --- | --- |
| Database only (for example G3 applied, `down` never run) | 0.019 | 0.46 | 13.7 |
| Session Identity + Control + Work, nothing stops it | 0.17 | 4.1 | 124 |
| Every service | 0.30 | 7.2 | 219 |
| **ALB only** after the backstop scaled tasks in and stopped the database (the backstop cannot delete the ALB, `backstop.tf` lines 11 to 13) | 0.037 | 0.89 | 27 |
| One forgotten NAT Gateway (must stay absent) | about 0.05 | about 1.2 | over 35 |

Until the backstop is applied and verified, only the GitHub schedule (19:17 and 01:47 UTC, observed up to about 5.5 hours late, once skipped) stops a forgotten session. A full forgotten month at the stage-2 rate is about **2.5 times the US$50 budget**; the budget alerts (admin@ and alert@munaxa.com) warn, they do not stop anything.

## 8. Service-by-service impact

| Service | In G3 | Idle effect | Session effect | Note |
| --- | --- | --- | --- | --- |
| RDS | instance, storage, backups | 2.74 storage; restarts | +0.019/h | Largest idle item with Secrets |
| ALB | none in G3 (SG only) | 0 | +0.027/h + LCU, +2 IPv4 | Created at `up`, deleted at `down` |
| NAT | **none, must stay absent** | 0 | 0 | Tasks use public IPs instead (+0.005/h each) |
| VPC endpoints | S3 gateway only | 0 (gateway endpoints are free) | 0 | No interface endpoint (those would be about US$0.01 an hour each per AZ [E]) |
| KMS | data key (+ licence key at Config A) | 1 (+1) | requests, cents | Plus the 2 existing state keys |
| ECR | none in G3 | 0 | storage of pushed images, 0.2 to 0.5 | Repositories are bootstrap |
| Secrets Manager | 10 bundles + RDS master secret | 4.40 | API calls, cents | One-run secrets add 0.40 each if not deleted |
| Route 53 | Cloud Map private zone | 0.50 | queries, cents | Cloudflare remains public DNS (no Route 53 public zone) |
| CloudWatch | ops log group | cents | ingestion 0.63/GB | Container Insights off |

## 9. Costs that cannot be verified yet [U]

- The exact split of the owner's figures by usage type and resource (needs a Cost Explorer group-by usage type or the Billing console; owner, read-only).
- The Docs final snapshot size and its monthly storage charge.
- Whether any hosted zone remains (December Route 53 line).
- Why AWS Glue appears with US$0.00.
- Whether ECS-managed task network interfaces carry the `Environment` tag in billing: public IPv4 charges may be **untagged** and so not counted by the **Testing** budget (`user:Environment$nonprod` filter), only by the account budget [E]. Check the first session's bill.
- The real session hourly cost: no session has ever run.
- Whether `Environment` has been activated as a cost allocation tag: until it is, the Testing budget (`user:Environment$nonprod`) reads US$0 and only the account budget sees Testing spend.
- The pre-existing `munaxa-account-monthly` budget of US$10 (TD-13) will alert once idle plus sessions pass US$10.

## 10. Budget impact of G3

- **Expected:** the account moves from about US$2.5 to 3 a month to **about US$11 to 12 a month idle**, about 23 % of the US$50 Testing target, leaving roughly 220 session-hours at the Identity + Control + Work rate.
- **Main risk:** a session or the database left running (§7). Mitigation order: dispatch `down` right after G3 and after every session; apply the backstop next; finish sessions before 19:00 UTC.
