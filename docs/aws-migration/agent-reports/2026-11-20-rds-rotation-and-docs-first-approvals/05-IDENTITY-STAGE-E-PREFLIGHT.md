# 05. Identity Stage E: preflight readiness

**Status: BLOCKED** until all three hold: (1) RDS rotation VERIFIED COMPLETE (file 03 §5), (2) preflight P-1 to P-10 pass on the day, (3) the owner explicitly approves the session. **Not executed. Nothing created.**

Governing documents (unchanged on main `0f06836`): runbook `2026-11-11-identity-final-operator-runbook/00` (S-0 to S-14, sections 12 to 15), `2026-11-15-identity-stage-e-owner-decisions/03` §5 (C-8G operator secret through CloudFormation), H-20 gate `scripts/aws/session-cleanup-gate.sh` (enforced by `aws-session.yml` before every `up`), E-1 guard `scripts/aws/connector/e1-task-guard.py`.

## 1. Preflight checklist (run on the day, read-only, before asking for the final yes)

| # | Check | Pass when | Today 20 Nov 18:3x UTC [V] |
| --- | --- | --- | --- |
| P-1 | RDS rotation | file 03 §5 V-1 to V-6 pass | **PENDING** (00:30 UTC 21 Nov) |
| P-2 | ECS idle | `munaxa-nonprod`: 0 services, 0 tasks | pass |
| P-3 | No session edge | 0 ALB, 0 target groups, 0 NAT, 0 EIP | pass (ALB, NAT, EIP checked) |
| P-4 | Cleanup R | latest execution SUCCEEDED (the 21:05 UTC run before the session) | pass for 19 Nov 21:05 UTC; recheck after 20 Nov 21:05 |
| P-5 | E-1 guard `discover` (all five families) | `PASS` | images and secret pins of the latest ACTIVE revisions match the manifest: db-admin rev 2, identity-migrate rev 2, identity-bootstrap rev 3, identity-probe rev 1, identity rev 2 (image digests `5983db9a…`, `5f3bdcce…`, `9a8c6ebd…`, Valkey `757b7e55…`; bundle pins `80914756…`, `a3cc6622…`). Full `discover` (env values, shapes, commands) runs at S-0 |
| P-6 | H-20 gate | `up` gate passes with the chosen `hard_stop_utc` | enforced by the workflow; R evidence above |
| P-7 | Budget | Testing below US$50 | 3.98 / 50 |
| P-8 | No pending change to a Stage E family | no merged config PR touching db-admin or identity task definitions since `0f06836` (C-2 must wait) | pass |
| P-9 | **New: no scheduled `down` can land inside the window** | that day's late run of the 01:47 UTC cron has **completed** (observed start 09:13 to 09:45 UTC, 18 to 20 Nov) before S-1 | check the run list on the day |
| P-10 | Operator secret | `munaxa-nonprod/identity-operator` absent before C-8G (it is created at S-5); stack `munaxa-nonprod-identity-operator-secret` absent | secret absent (not in `ListSecrets`); stack not read today |

**Why P-9 is new:** both scheduled `down` runs start 6 to 7.5 hours late (19:17 cron at about 01:20 UTC, 01:47 cron at about 09:15 UTC on 18 to 20 Nov). A late `down` that starts inside a session deletes the ALB and services and stops the database in the middle of migrate or bootstrap. Combined with the runbook's latest start (15:30 UTC) the safe window is **about 10:00 to 15:30 UTC (13:00 to 18:30 Amman)**, starting only after that morning's scheduled run has finished.

## 2. Exact expected AWS resources and changes

| Step | Change | Count / identity |
| --- | --- | --- |
| S-1 `up` (aws-session.yml, ref main) | starts `munaxa-nonprod-pg` if stopped; Terraform `edge_enabled=true`, `services_enabled=true` | **11 creates**: the ALB, its listeners and listener rules, the identity target group, the `identity` ECS service and its service-discovery entry (the workflow refuses any other address type) |
| S-3 | RunTask `munaxa-nonprod-db-admin` (rev 2) | creates the identity roles and database; exit 0 |
| S-4 | RunTask `munaxa-nonprod-identity-migrate` (rev 2) | Prisma migrations; exit 0 |
| S-5 | C-8G: CloudFormation stack `munaxa-nonprod-identity-operator-secret` | 1 stack, 1 secret `munaxa-nonprod/identity-operator` (password generated inside Secrets Manager, retained) |
| S-5b / S-6d | open / close the 60-minute bootstrap read window | IAM read window for the bootstrap execution role only |
| S-6 | RunTask `munaxa-nonprod-identity-bootstrap` (rev 3) | organisation `munaxa-group` and the operator (email from `IDENTITY_OPERATOR_EMAIL`, never in the repo) |
| S-7 | force a new deployment of `identity` | service steady, 1 task (identity + Valkey sidecar) |
| S-9 / S-9b | RunTask `munaxa-nonprod-identity-probe` (rev 1) | 28/28 assertions; throwaway account disabled |
| S-12 `down` | Terraform switches false; database stopped | **11 deletes** |

Persistent by design after the session: task-definition revisions, log groups (14 days), the database data, the operator secret and its stack, the certificate.

## 3. Cost and duration

| Item | Value |
| --- | --- |
| Session hard limit | 3 hours (T0 + 3 h, and never after 18:30 UTC) |
| Running cost | about US$0.08 to 0.10 an hour (ALB + 1 Fargate task + RDS t4g.micro) [E] |
| Expected | about US$0.20 to 0.30 for a 2 to 3 hour session [E] |
| Ceiling if Claude loses control | cleanup P at H, S at H + 30 min, R at 21:05 UTC and the 21:00 UTC backstop bound it to the same day [D] |

## 4. Health checks and acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| E-A1 | `up` green, 11 creates, database `available` | run log summary (addresses and actions only) |
| E-A2 | db-admin and migrate exit 0 | E-1 `status` by run token: exit codes, image digest match |
| E-A3 | operator secret created through CloudFormation, value never returned | C-8G result; C-24 CloudTrail custody check `PASS` |
| E-A4 | bootstrap exit 0; window closed | E-1 `status`; C-8G `status` window `closed` |
| E-A5 | service steady; target healthy | ECS service events, target health |
| E-A6 | listener: HTTPS 443 only; operator and admin routes refused | listener check (S-8) |
| E-A7 | probe 28/28 (health, sign-in route, JWT `aud`/`exp`, MFA paths, refresh reuse, lockout) | probe exit 0 and count |
| E-A8 | log scan: no secret patterns | count-only scan (S-10) |
| E-A9 | `down` completed by T0 + 3 h | run times |

## 5. Rollback and same-day cleanup

1. Any failure: stop the step, delete nothing by hand, dispatch `down`, then run §6.
2. If `down` fails: cleanup P (at H), S (H + 30 min), R (21:05 UTC) delete the session resources; the backstop (21:00 UTC) stops the database and scales services to 0.
3. A failed migrate leaves the database for a rerun; Stage E never drops data.
4. The operator secret is kept by design (custody Option A); a failed C-8G create is removed only by a separate owner-approved root step.

## 6. Evidence that cleanup succeeded (read-only, after `down`)

`DescribeLoadBalancers` 0; `DescribeTargetGroups` 0; ECS services 0 and tasks 0; `munaxa-nonprod-pg` `stopped`; EIPs 0; public ENIs 0; NAT 0; backstop schedules enabled; no `munaxa-nonprod/identity-bootstrap` secret; C-8G `status` PASS with window closed; CloudTrail denials only the known S-1 to S-8 signatures; cleanup executions P and S `SUCCEEDED` and P deleted; next day Cost Explorer for the session date.

## 7. Approval question (after P-1 passes)

"Approve Identity Stage E on 21 Nov 2026, starting between 13:00 and 18:30 Amman, after that morning's scheduled down has finished?" Yes / No.
