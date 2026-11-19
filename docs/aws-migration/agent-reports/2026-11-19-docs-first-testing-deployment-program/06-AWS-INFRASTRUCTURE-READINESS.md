# 06. AWS infrastructure readiness

**Testing foundation and safeguards: VERIFIED COMPLETE.** Every read below was read-only, as root through the connector, 19 Nov 21:51 to 22:30 UTC. No secret value was read.

## 1. Live inventory

| Area | Reading |
| --- | --- |
| ECR | identity (api, migrate: `5277d71`, `5a5994f`, `2db6ed9`); control (api, migrate, portal: `a24c568`); work (api, admin, migrate: `b490b25`); docs (api `f8a8bea`, web `db97825`, antivirus `c6a6d8c`; no migrate repository); school repositories empty |
| ECS | cluster `munaxa-nonprod`: 0 services, 0 tasks |
| RDS | `munaxa-nonprod-pg` stopped; t4g.micro, PG 16.13, 20 GB gp3, encrypted, private, deletion protection, 7-day backups; auto-restart 20 Nov 21:07:07 UTC |
| ELB | none |
| ACM | `*.test.munaxa.com` ISSUED to 22 May 2027 (S-3: renewal needs it in use) |
| Network | no NAT gateway, no EIP, one S3 gateway endpoint, private zone `nonprod.munaxa.internal` |
| Schedules | 12 enabled |
| Step Functions | cleanup R `1a6aff64` SUCCEEDED 19 Nov 21:05:22; dry run 03:45 |
| Alarms | `session-cleanup-failed`, `session-cleanup-not-run`: OK |
| KMS | `45eda044` nonprod data; `679d1b6b` shared state; `c11c7689` Docs state; `9758d15e` old Docs production, PendingDeletion |
| Snapshots | manual `munaxa-docs-eu-prod-pg-final` (4 Nov, delete about 4 Dec) |
| Legacy | old Docs eu-prod task definition families still ACTIVE (no cost; tidy later) |

## 2. RDS master secret rotation

- **Not yet due:** 20 Nov 23:59:59 UTC. The DB auto-restarts at 21:07 UTC 20 Nov, which allows rotation to run.
- The rotation thread did the pre-rotation metadata checks at 21:46 UTC 19 Nov (`/mnt/project-files/reports/2026-11-21-rds-secret-rotation-verification/PRE-ROTATION-NOTE.md`) and verifies after rotation at about 00:30 UTC 21 Nov. This task did not duplicate that work and **claims nothing** about the rotation.
- Metadata seen here: AWSCURRENT and AWSPENDING on the same version, plus AWSPREVIOUS. No value read.

## 3. Budgets and cost to date (November)

| Budget | Spend / limit (US$) |
| --- | --- |
| Testing | 3.52 / 50 |
| shared account | 11.91 / 50 |
| account monthly | 11.91 / 10 (over; known B-1, D-N1) |
| docs-eu-prod (legacy) | 5.91 / 10 |

Cost Explorer, November to date: RDS 3.94, ELB 2.13, Secrets Manager 2.04, KMS 1.71, Route 53 1.00, VPC 0.79, ECR 0.23.

## 4. Safeguards

H-20 gate (10 conditions), daily cleanup R at 21:05, backstop at 21:00 (stops RDS), alarms with a confirmed email subscription, budgets. All verified working on 19 to 20 Nov [V, #141, #142].

## 5. Offline Terraform

- Stack `terraform test`: **75 passed, 0 failed** (Terraform 1.16.5, aws provider 6.67.0, checksums verified, no AWS credentials in the environment).
- Mocked Docs enablement: D-1 42/0/0, D-2 62 creates (file 04 §6).
- No plan against the live S3 backend was run.

## 6. Known items carried forward

- **R-7:** the expected-changes declaration in the repository describes the last applied change; the next config PR must replace it.
- **B-1:** the account-wide budget limit (10) is below normal spend.
- **S-3:** ACM renewal of an unused certificate fails; the first sessions before April 2027 fix this.
- The `picomatch` audit exception stays until upstream ships a fix.
