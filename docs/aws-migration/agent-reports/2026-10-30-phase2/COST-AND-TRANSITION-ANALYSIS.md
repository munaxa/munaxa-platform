# Cost and transition analysis: phase 2, 30 Oct 2026

## 0. Evidence and its limits

- **No cost figure in this file was re-measured in this pass.** The AWS connector's sign-in had
  expired (the read-only call failed at about 20:20 UTC), so no Cost Explorer, Pricing or resource
  read succeeded.
- The old Docs figure is the **29 Oct measurement** from Cost Explorer and resource reads, recorded
  in project memory and the 30 Oct baseline: about US$1.55 a day, **about US$47.80 a month idle**
  [C]. Cost Explorer history starts 22 Oct, so the forecast is unreliable.
- The Testing figures are **estimates** from list prices taken from memory, by Agent 1 and Agent 7 on
  30 Oct [A]. Agent 1 estimated about US$13 a month idle and about US$0.30 per session hour. Agent 7
  estimated about US$11 a month idle, US$0.21 per session hour without Docs and US$0.30 with Docs.
  This file uses the range: **US$11 to 13 idle, US$0.21 to 0.30 per active session hour.**

## 1. Existing Docs infrastructure, during the transition [C]

| Item | US$ / month (idle) |
| --- | --- |
| Application Load Balancer (`aws_lb.main`, deletion protection on) | 19.71 |
| Public IPv4 addresses | 7.30 |
| RDS PostgreSQL instance | 13.87 |
| Storage (RDS, S3, snapshots, ECR) | 2.74 |
| KMS keys | 2.00 |
| Secrets Manager secrets | 1.20 |
| **Total** | **≈ 47.80** |

`enable_services` is false (no ECS tasks run), so this is the floor while the stack exists.

## 2. New Testing infrastructure [A]

| State | US$ / month |
| --- | --- |
| Idle (sessions down: RDS storage and the stopped instance's re-start cycle, KMS, secrets, ECR storage, logs, Route 53 private zone) | 11 to 13 |
| Per active session hour (Fargate tasks for all services, ALB, public IPv4, RDS running) | 0.21 to 0.30 |
| 20 session hours | 15.20 to 19.00 |
| 40 session hours | 19.40 to 25.00 |
| Session hours that fit in US$50 | about 123 (at 13 + 0.30/h) to about 185 (at 11 + 0.21/h) |

**Testing on its own can meet the US$50 target** with a normal amount of testing: on these
estimates, any month with fewer than about 120 session hours.

## 3. Combined, during the temporary transition [A]

The two figures are **not** within US$50 together. They are shown separately because the old Docs
stack is temporary.

| Scenario | Old Docs | Testing | Account total |
| --- | --- | --- | --- |
| Testing idle | 47.80 | 11 to 13 | **58.80 to 60.80** |
| 20 session hours | 47.80 | 15.20 to 19.00 | **63.00 to 66.80** |
| 40 session hours | 47.80 | 19.40 to 25.00 | **67.20 to 72.80** |

During the transition **the account is above US$50 even before any session**, because of the old
Docs stack. This is expected and time-limited. It does not mean Testing is over its target.

Per week of overlap the old stack costs about US$11. A two-week overlap from the first session to
retirement costs about US$22 on top of Testing.

## 4. After the old Docs infrastructure retires [A]

| Scenario | Account total |
| --- | --- |
| Testing idle | 11 to 13 |
| 20 session hours | 15.20 to 19.00 |
| 40 session hours | 19.40 to 25.00 |

Within US$50, with about US$25 to 35 of headroom at 40 hours. (Production is costed separately and
is not in the Testing target.)

## 5. Budgets, as code now stands

- **Account budget**, US$50 (`aws_budgets_budget.account`, owner decision of 29 Oct), unchanged.
  During the transition it **will** send the 80% and 100% alerts every month, because the old Docs
  stack alone is about US$48. That is correct behaviour for an account-wide ceiling. It is not a fault.
- **Testing budget**, US$50, added in platform#29 (**merged** as `c41f08d` (head `7af38e0` pinned)): `aws_budgets_budget.testing`, filtered on
  `user:Environment$nonprod`, the tag the shared stack puts on every nonprod resource. It measures the
  target the brief sets. **Owner step:** activate `Environment` as a cost allocation tag in the
  Billing console (one time). Until then this budget reads US$0. Neither budget exists until G2.

## 6. Safe cost reductions

Nothing below was done in this pass, and nothing deletes a resource.

| # | Reduction | Saving | Safe now? | Gate |
| --- | --- | --- | --- | --- |
| 1 | **Shorten the overlap.** Run the Docs acceptance checks (DOCS-REPLACEMENT-AND-RETIREMENT §4) in the first Testing session, then retire the old stack under G9 | ≈ US$11 per week of overlap; US$47.80 a month for good | Yes. Planning only | G9 for the retirement itself |
| 2 | Keep Testing sessions down by default: the evening backstop in `aws-session.yml` already brings a session down; dispatch `up` only for testing | Keeps Testing near US$11 to 13 | Yes, already in code | — |
| 3 | Run Docs services only in sessions where Docs is tested. Docs adds about US$0.09 per hour (0.30 versus 0.21) | ≈ US$0.09 per session hour | Not available yet: Docs services follow the same `services_enabled` switch as every service (`stack/docs.tf` line 18). A separate Docs session switch would be a small platform PR [R] | Code PR |
| 4 | Stop the old Docs RDS instance during the transition (it restarts itself after 7 days, so it needs a weekly stop) | ≈ US$12 of the 13.87 a month | **Deferred**, by the 29 Oct decision; a modification of the old stack | Separate owner approval |
| 5 | Remove the old Docs ALB and its public IPv4 early | ≈ US$27 a month | **No.** That is retirement by another name. It waits for acceptance and G9 | G9 |
| 6 | ECR lifecycle policies (already in bootstrap), log retention as set in the stack | Small | Already in code | — |
| 7 | Activate the `Environment` cost allocation tag so Testing's budget is real | Visibility, not saving | Yes, owner Billing step | Owner |

## 7. Is the US$50 Testing target achievable?

**Yes for Testing, on the estimates [A]:** about US$11 to 13 idle, plus up to roughly 120 session
hours a month. **No for the whole account during the transition**: the account totals US$58.80 to
US$72.80 while the old Docs stack runs. After retirement, the account totals about US$11 to 25 at
up to 40 session hours.

Confirm these figures with a read-only Cost Explorer and Pricing check after the connector is
signed in again, before G2. That check is step 0 of the next phase.
