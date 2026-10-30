# Cost estimate: Munaxa AWS Testing (eu-central-1)

30 Oct 2026, Agent 7. **Rates are list prices from memory and the platform README, not checked
against the Pricing API.** The AWS connector needs to be signed in again, so live billing was not
read. The old Docs stack figure is the measured 29 Oct evidence.

Rates used: Fargate US$0.04656 per vCPU-hour and US$0.00511 per GB-hour, public IPv4 US$0.005
per hour, ALB about US$0.03 per hour with LCUs, RDS `db.t4g.micro` about US$0.02 per hour.

## Idle (between sessions)

| Item | US$/month |
| ---- | --------- |
| RDS stopped, 20 GB gp3 | 2.70 |
| KMS: data, licence, state | 3.00 |
| Secrets: 8 bundles (+1 for Docs) | 3.20 (3.60) |
| Route 53 private namespace | 0.50 |
| ECR images and logs | under 2 |
| **Testing idle floor** | **about 11** |

## Per session hour (one task per service)

| Item | US$/hour |
| ---- | -------- |
| Identity 0.5 vCPU/1 GB | 0.028 |
| Control API, Control portal, Work API, Work admin, School API, School admin (6 × 0.25/0.5) | 0.085 |
| ALB | 0.03 |
| Public IPv4: 7 tasks + 2 ALB | 0.045 |
| RDS running | 0.02 |
| **Without Docs** | **about 0.21** |
| Docs: web, api + redis, scanner, 3 IPv4 (Agent 4) | 0.088 |
| **With Docs** | **about 0.30** |

## Monthly totals

| Scenario | 20 h | 40 h | 100 h |
| -------- | ---- | ---- | ----- |
| Testing only, with Docs | 17 | 23 | 41 |
| Testing + old Docs stack (US$47.8) | 65 | 71 | 89 |
| Always on, Testing with Docs (730 h) | about 230 | | |

Testing on its own fits US$50 up to about 130 session hours a month. **With the old Docs stack
running in the same account, the account is above US$50 before any session (B2).**

## Cost controls and risks

- Sessions only. The evening cron in `aws-session.yml` takes Testing down at 20:00 UTC and re-stops
  RDS, which restarts by itself after 7 days.
- R-09: GitHub disables schedules in public repos after 60 days without activity, so a budget alert
  at US$50 should be the second backstop (T14).
- FARGATE_SPOT is registered on the cluster but unused. It would cut about 70% of task cost in
  Testing, if interruptions are acceptable. Not proposed as a change here.
- Public IPv4 is about 20% of session cost, because the design chose public tasks over NAT.
