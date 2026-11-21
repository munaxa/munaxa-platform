# 05 Open risks and owner actions

Every item was re-checked at 19 Nov 2026 21:22 UTC (00:22 Amman) unless the row says otherwise.

## Historical risks

| # | Risk | Before (19 Nov 08:56 UTC) | Now (21:22 UTC) | Classification |
| --- | --- | --- | --- | --- |
| 1 | RDS master secret has an AWSPENDING label | one version labelled `AWSCURRENT,AWSPENDING`, one `AWSPREVIOUS` | same (metadata only, via `DescribeSecret`; no value read) | **Still open.** Harmless while AWSPENDING sits on the AWSCURRENT version. It must be watched after the next rotation. |
| 2 | Next rotation 20 Nov 23:59:59 UTC | rotation on, every 7 days, last rotated 13 Nov 17:26 UTC | same; next 2026-11-20 23:59:59 UTC (21 Nov 02:59:59 Amman) | **Still open.** The rotation falls while the database is stopped. This report does not verify whether an RDS-managed rotation completes on a stopped instance. Re-check after 21 Nov 00:30 UTC: one AWSCURRENT, one AWSPREVIOUS and no stray AWSPENDING. |
| 3 | ACM `*.test.munaxa.com` renewal | ISSUED, INELIGIBLE, not in use | ISSUED, INELIGIBLE, 0 users, valid to 22 May 2027 | **Still open.** It becomes eligible once a load balancer uses it in a session. There is no action before about March 2027. |
| 4 | Legacy $10 budget exceeded | `munaxa-account-monthly` 11.906 / 10 | 11.906 / 10 (no new billing data since) | **Still open; requires owner decision** (already listed in earlier reports): raise or retire this legacy budget, or accept the alerts. `munaxa-shared-account-monthly` is 11.906 / 50. |
| 5 | Testing budget | `munaxa-shared-testing-monthly` 3.518 / 50 | 3.518 / 50 | **Still open (healthy).** 7% used. `munaxa-docs-eu-prod-monthly` 5.913 / 10. |
| 6 | picomatch GHSA-fc5q-39xc-vjpf exception | accepted exception, lockfile 4.0.5 / 2.3.2 | `package.json` audit ignore still present; lockfile still 4.0.5 and 2.3.2 on `main` 0f06836 | **Still open (accepted).** Remove the exception when a fixed release is published. |
| 7 | B-H1 bounded bootstrap secret-read window | accepted residual risk (15 Nov) | unchanged; it can only be re-tested in Stage E | **Still open (accepted, inherited).** Cannot be verified before Stage E. |
| 8 | R-7 `envs/nonprod.expected-changes.json` still declares the 12 applied D-B3/D-PIN changes | open | unchanged on `main` (intent still names D-B3/D-PIN) | **Still open.** It fails closed, so it is safe. The next stack configuration PR must replace the declaration with its own changes. |

None was resolved, and none got worse.

## New findings

None that needs remediation. Two observations are recorded for completeness:

- **O-1.** The 21:00 UTC backstops log 11 failed write calls every evening: ServiceNotFound and InvalidDBInstanceState. That is their designed idle behaviour, but it adds noise to any CloudTrail review. No change is proposed.
- **O-2.** The `munaxa-nonprod-alb` security group allows 80 and 443 from the internet with nothing attached. It is unchanged and by design. No change is proposed.

## Required remediation

None. No check required a write operation.

## Owner decisions

| Decision | Needed now? | Note |
| --- | --- | --- |
| Review and merge this docs-only PR | yes (routine) | docs only |
| Legacy $10 budget (risk 4) | no, open since early November | it only sends alerts; no cost impact |
| Whether to proceed toward a Testing session / Stage E | no, not requested here | **Stage E is NOT authorized.** The gate's AWS conditions currently pass, but that is not an authorization. |

## Recommendations versus authorized actions

Everything in this file is a recommendation or an observation. This task authorized none of the following, and none was done:

- an AWS change;
- a Terraform apply or plan;
- a schedule change;
- a secret read;
- a deployment;
- a migration;
- a session;
- a merge.
