# 08. Risks, blockers, cost and recommended next action

## 1. Cost [V, Cost Explorer and Budgets, read 20 Nov about 18:35 UTC]

November 1 to 20 (unblended, estimated): **US$12.62**.

| Service | US$ |
| --- | --- |
| RDS | 4.19 |
| Secrets Manager | 2.30 |
| Elastic Load Balancing | 2.13 (earlier sessions and the G3 recovery, 1 to 6 Nov) |
| KMS | 1.87 |
| Route 53 | 1.00 |
| VPC | 0.79 |
| ECR | 0.25 |
| S3 | 0.07 |
| Cost Explorer API | 0.02 |

Daily: 1 to 3 Nov US$1.6 to 2.1 (before the retirement of Docs eu-prod and the G3 recovery), then US$0.41 to 0.44 a day from 7 Nov; 13 Nov US$0.51 (the RDS auto-start day); 20 Nov partial. **No anomaly**: every day since 7 Nov is within US$0.40 to 0.51.

| Budget | Spent / limit |
| --- | --- |
| munaxa-shared-testing-monthly | **3.98 / 50** |
| munaxa-shared-account-monthly | 12.62 / 50 |
| munaxa-account-monthly | 12.62 / **10** (over; D-N1, the limit predates the Testing build) |
| munaxa-docs-eu-prod-monthly (retired) | 6.09 / 10 |

Projection against the US$50 Testing target [E]: idle about US$12 to 13 a month (about US$13 to 14 with the C-1 licence key); with about 40 session hours US$18 to 25; with about 100 session hours about US$35. Tonight's database run (about 4 to 4.5 hours) adds about US$0.07.

## 2. Risks and blockers

| Id | Risk / blocker | Likelihood / impact | Mitigation | Status |
| --- | --- | --- | --- | --- |
| K-1 | Rotation still fails after the DB is available | low / blocks Stage E | file 03 §6; AWSCURRENT stays valid | NEEDS VERIFICATION |
| K-2 | A late scheduled `down` lands inside a session | high if the window starts early / session torn down mid-migrate | P-9: start after that morning's run, 13:00 to 18:30 Amman | mitigated by procedure |
| K-3 | Control release on Debian keeps 6 of 7 HIGH | certain with control#10 | control#11 (Alpine); scan gate | NEEDS VERIFICATION (release) |
| K-4 | control#11 image job red | was certain / blocks A-5C | the first 401 was my CI wiring bug (token env on the wrong step), fixed in `ee9caa7` by another project session; the job is still red on `98d7583`, and that session is working on it | NEEDS VERIFICATION |
| K-5 | Docs release shows 1 HIGH (glibc) | likely / policy | D-G1 | owner decision |
| K-6 | Alpine `apk add` takes current r-releases (libssl3/libcrypto3 3.5.9-r1 in CI) | medium / reproducibility | zlib pinned exactly; verify-image.sh checks the package set; digests recorded at publish | accepted |
| K-7 | Hand-edited lockfiles (identity#21, work#33, school#26) | low / CI catches | `pnpm install --frozen-lockfile` in CI | see file 02 |
| K-8 | Withdrawn image pinned by mistake | low | **new Terraform validation refuses the withdrawn digests** (Control a24c568, Work api b490b25, Identity 5a5994f and 5277d71); 2 new mocked tests | VERIFIED [T] |
| K-9 | Account budget alert noise | certain | D-N1 | open |
| K-10 | ACM certificate renewal ineligible while unused | low before April 2027 | use it in a session | open |

## 3. What was not done

- No AWS write: no Terraform apply, destroy, import or live plan; no state lock.
- No RDS start or stop. No `RotateSecret`, no `GetSecretValue`, no label change.
- No ECS task or service; no `up` or `down`; no Stage E.
- No image published, no tag, no workflow dispatched or re-run, no PR merged.
- No Cloudflare, Resend or DNS change. No secret script run.
- Local scanning of the new base images was not possible: installing a scanner was refused by this session's safety policy, and Debian mirrors are not reachable. ECR's scan on push remains the evidence.

## 4. Recommended next action

**The single safest next action:** run the read-only rotation verification at or after 00:30 UTC on 21 Nov (03:30 Amman), and do nothing to the database or the secret before it. If it passes, ask the owner the Stage E question in file 07.
