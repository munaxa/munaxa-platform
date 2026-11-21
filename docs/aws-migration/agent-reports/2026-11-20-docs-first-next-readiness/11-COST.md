# 11. Cost

## 1. Actuals [V, Cost Explorer and Budgets, read 20 Nov about 09:30 UTC]

November to date (1 to 19 Nov, unblended): **US$12.46**.

| Service | US$ |
| --- | --- |
| RDS | 4.11 |
| Secrets Manager | 2.26 |
| Elastic Load Balancing | 2.13 (G3 recovery and earlier sessions) |
| KMS | 1.83 |
| Route 53 | 1.00 |
| VPC | 0.79 |
| ECR | 0.25 |
| S3 | 0.07 |
| Cost Explorer API | 0.02 |

**Daily idle:** US$0.43 (13 to 18 Nov) and US$0.35 (19 Nov). That is **about US$11 to 13 a month idle**, which confirms the 19 Nov estimate of about US$12.

| Budget | Spent / limit |
| --- | --- |
| Account | 12.46 / 10 (**over**: decision B-1/D-N1 still open; the limit predates the Testing build) |
| Shared | 12.46 / 50 |
| Testing | 3.90 / 50 |
| docs-eu-prod (retired) | 6.02 / 10 |

## 2. Expected changes from the coming steps [E]

| Step | One-off | Monthly at rest |
| --- | --- | --- |
| RDS auto-restart 20 Nov 21:07, stopped by the backstop 21 Nov 21:00 | about US$0.4 | 0 |
| Stage E (3-hour cap) | under US$0.30 | 0 |
| C-1 (KMS asymmetric licence key) | 0 | US$1.00 |
| Control and Docs bundles (5 secrets already exist and are billed) | 0 | 0 extra |
| Docs `migrate` ECR repository and new images | 0 | about US$0.10 storage |
| Control and Docs session (Identity, Control api and portal, Docs) | about US$0.22 an hour | 0 |

## 3. Projection

| Usage | Monthly |
| --- | --- |
| Idle | about US$13 to 14 (with the licence key) |
| Plus about 40 session hours | US$18 to 25 |
| Plus about 100 session hours | about US$35 |

All of these are inside the **US$50 Testing target**. Session hours are bounded by the 3-hour hard stop, R at 21:05 UTC and the backstop at 21:00 UTC.
