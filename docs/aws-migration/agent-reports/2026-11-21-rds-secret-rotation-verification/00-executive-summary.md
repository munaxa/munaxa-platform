# RDS secret rotation verification, Testing idle check and PR reconciliation (21 Nov 2026)

Owner brief: 19 Nov 2026 21:46 UTC (20 Nov 00:46 Amman), "Post-RDS Secret Rotation Verification,
PR Reconciliation, and Next-Step Readiness".
Account `229251310592`, region `eu-central-1` (plus `us-east-1` for global CloudTrail events).
Observation window: **21 Nov 2026 04:23 to 04:24 UTC (07:23 to 07:24 Amman)**, read-only AWS
connector signed in as root (the approved development access method).

## Result

| Question | Answer | Evidence class |
| --- | --- | --- |
| Did the RDS master secret rotation complete? | **SUCCEEDED** at 20 Nov 21:26:28 UTC (21 Nov 00:26:28 Amman) | Direct (DescribeSecret, ListSecretVersionIds, CloudTrail, RDS events) |
| Exactly one AWSCURRENT and one AWSPREVIOUS? | **Yes** | Direct |
| Any AWSPENDING? | Yes, the label sits **on the new AWSCURRENT version** (same pattern as after the 13 Nov rotation) | Direct; "this is normal for RDS-managed secrets" is inference |
| Unexpected versions? | None. Three versions in total: current, previous, one older deprecated (no labels) | Direct |
| Database stopped? | **Stopped** since 21 Nov 00:57:33 UTC (03:57:33 Amman); configuration unchanged | Direct |
| Testing environment idle? | **Yes.** ECS 0 running, no ALB, NAT, EIP, EC2 or ElastiCache, one RDS network interface only | Direct |
| Safeguards in place? | **Yes.** 12 schedules enabled, cleanup R ran and SUCCEEDED 20 Nov 21:05 UTC, both alarms OK, SNS subscription confirmed | Direct |
| IAM as reviewed? | **Yes.** No IAM users, no access keys, boundary/cleanup/session-read policies match the H-20 expected set after normalization | Direct (policy match only, not proof of all infrastructure) |
| Prohibited writes by Claude? | **None** | Direct (CloudTrail: no write by the connector identity) |

## What happened, in order (UTC, Amman in brackets)

1. 20 Nov 05:08 to 20:25: 16 hourly rotation attempts failed while the database was stopped (expected).
2. 20 Nov 21:05:22: daily cleanup R ran and SUCCEEDED (everything absent, database stopped).
3. 20 Nov 21:11:51 (00:11:51 21 Nov): RDS started the database itself because it had been stopped for 7 days.
4. 20 Nov 21:25:27 to 21:26:28 (00:25 to 00:26 Amman): the rotation ran and succeeded.
5. 21 Nov 00:51:11 (03:51 Amman): the GitHub scheduled `down` run 44846513554 stopped the database;
   stopped at 00:57:33 (03:57 Amman). The database ran for about 3 h 43 min.

## Main new risk

The next rotation is due **27 Nov 23:59:59 UTC**, but RDS will only start the stopped database
itself at **28 Nov 00:57:33 UTC**. The next rotation can therefore fail all day on 27 Nov and
may run late. This does not lock anyone out (the current password stays valid). Inference, to be
checked read-only on 28 Nov. See file 06.

## Not done (by design)

No GetSecretValue, no secret value read, no AWS change, no Terraform plan or apply, no workflow
dispatch, no Step Functions execution, no deployment, no migration, no PR merge, no Stage E.
**Stage E remains NOT AUTHORIZED.**

## Files

- `01-rds-secret-rotation.md`: rotation evidence and timeline
- `02-testing-environment.md`: database, ECS, network, security groups
- `03-iam-and-cloudtrail.md`: IAM state, policy comparison, CloudTrail writes
- `04-schedules-and-safeguards.md`: schedules, backstops, cleanup R, alarms, SNS
- `05-pr-reconciliation.md`: PRs #141 and #142 against main, review order
- `06-risks-and-next-actions.md`: risks, owner decisions, next permitted action
