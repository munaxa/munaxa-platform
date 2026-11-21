# 06. RDS restart stop, cost and rollback

## RDS restart stop: enablement package prepared, NOT enabled

platform#152 (merged this morning) added the restart-stop machinery to the stack, off by default
(`rds_restart_stop_enabled = false`). This sprint adds what turning it on needs. The change is on
`main` with this PR and is still off by default. The full owner procedure is in
[supporting/rds-restart-stop-enablement.md](supporting/rds-restart-stop-enablement.md); the stack
declaration is in [supporting/rds-restart-stop-enable.expected-changes.json](supporting/rds-restart-stop-enable.expected-changes.json).

**What changed in the repository:**

| Where | Change |
| --- | --- |
| `infra/aws/bootstrap/iam_rds_restart_stop.tf` (new) and `variables.tf` | New flag `testing_rds_restart_stop`, default false. It is refused unless `testing_session_cleanup` is true. When on, the deployer gets policy `munaxa-shared-deployer-nonprod-rds-restart-stop`, which allows: `events:*Rule*`/`*Targets*`/tagging on `rule/munaxa-nonprod-rds-restart-stop` only, and `iam:PassRole` of the two restart-stop roles, to `states.amazonaws.com` and `events.amazonaws.com` respectively |
| `infra/aws/bootstrap/iam.tf` | Nonprod workload boundary (only when the flag is on): `states:StartExecution` on the restart-stop state machine; `scheduler:ListSchedules`; `secretsmanager:DescribeSecret` on the RDS master secret, in the two tag forms the boundary already uses. **Prod boundary unchanged** |
| `infra/aws/bootstrap/iam_session.tf` | Session-read policy: `events:DescribeRule`, `ListTargetsByRule`, `ListTagsForResource` on that one rule |
| `infra/aws/stack/session-cleanup.tf` | **Bug fix in #152.** The cleanup alerts topic policy admitted only `munaxa-nonprod-session-cleanup-*` alarms, so the restart-stop alarm could never have notified. It now admits `munaxa-nonprod-rds-restart-stop-failed` by exact name, and only while the stack flag is on |

**Tests** (Terraform 1.16.7 and AWS provider 6.67.0, mocked):
- Bootstrap: 23/23 pass (3 new runs).
- Stack: 91/91 pass.
- `fmt` and `validate` are clean.
- Every policy rendered with the defaults is **byte-identical to `main` before this change**, so today's plans do not move.

**Owner path** (file 05 item 6):
1. Bootstrap plan and apply: **2 add, 2 change, 0 destroy**.
2. Claude PR sets the flag in `nonprod.tfvars`.
3. Stack plan and apply: **8 add, 1 change**.
4. Claude PR makes the bootstrap flag default to true. Otherwise a later root plan without the `-var` would remove the grants.

**Not verified until a live run:**
- the Step Functions SDK field names;
- that RDS-EVENT-0154 arrives with the instance ARN;
- whether the master secret carries `aws:rds:primaryDBInstanceArn` (the by-tag statement is the fallback);
- that the provider needs no further `events:` actions.

**If not enabled:** AWS restarts the stopped database after 7 days, around 28 Nov 10:45 UTC
(inference from the Stage E stop). It then runs until the nightly backstop at 21:00 UTC, about
10 hours at db.t4g-class cost. A few dollars at most each time.

## Cost while idle (unchanged)

- Services at desired 0.
- No ALB between sessions.
- Database stopped.
- Backstop at 21:00 UTC, cleanup R at 21:05 UTC with alarms, the H-20 gate, scheduled `down`.

Session 1 adds about US$0 (secrets already exist; empty ECR repository). Session 2 adds a KMS key
(US$1 a month) and ECR storage (cents), plus live session hours (file 05, items 10 and 12; estimates).

## Rollback summary

| Change | Rollback |
| --- | --- |
| Images | Never run until pinned. A withdrawn digest is refused by Terraform |
| Apply 1 / Apply 2 / pin apply | Apply the previous tfvars. The KMS key goes to pending deletion, which is cancellable |
| Sessions | `down`; the backstop and cleanup R are independent of the operator |
| Secrets | Versions are kept; re-pin the previous version id |
| Docs bootstrap | Previous commit apply; the repository is empty |
| RDS restart stop | Stack first, then bootstrap |
