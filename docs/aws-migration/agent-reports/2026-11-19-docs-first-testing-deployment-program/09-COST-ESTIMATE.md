# 09. Cost estimate

All figures are estimates **[E]** in US$, eu-central-1, on-demand prices, before tax. Fargate is priced at US$0.04656 per vCPU-hour and US$0.00511 per GB-hour. Actual November spend to date is in file 06 §3.

## 1. Testing

| Scenario | Hourly while a session runs | Notes |
| --- | --- | --- |
| Idle (nothing running) | about US$12 a month in total | RDS storage and backups, Secrets Manager (per secret), KMS keys, Route 53 zones, ECR storage |
| Identity only (Stage E) | about US$0.08 | 1 task with Valkey sidecar, ALB, RDS t4g.micro |
| Docs alone (api, web, antivirus, ALB, RDS) | about US$0.15 | Docs tasks about US$0.072 |
| Docs path (Identity, Control api and portal, Docs) | about US$0.22 | the configuration of step 4 |
| All four products | about US$0.30 | School not publishable yet |

Expected monthly Testing use: with about 40 session hours a month, about US$12 idle plus US$6 to 12 of sessions, so **US$18 to 25 a month**, well inside the US$50 Testing budget. The first Docs deployment (file 08, steps 1 to 4) adds about US$5 to 10 once.

## 2. Production

| Scenario | Monthly |
| --- | --- |
| Docs first (Docs, Control, Identity always on, Multi-AZ off at start, one ALB, node-based Valkey cache.t4g.micro, NAT or endpoints as decided in AW-06) | about US$120 to 160 |
| All products always on | about US$170 to 230 |

The largest items are the ALB (about US$20 a month plus LCUs), RDS (instance class and storage), Fargate tasks running all month, the NAT or VPC endpoints decision, and the cache node. Resend's free tier covers early mail volume.
