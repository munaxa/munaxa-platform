# 01. RDS rotation and automatic restart: assessment and proposal

Written 21 Nov 2026, about 10:30 UTC (13:30 Amman). Repository analysis only. **Nothing here is
implemented or applied.** Any change below is an infrastructure change and needs its own owner
decision, plan, declaration and apply.

Evidence tags: **[V]** verified directly (from the cited report's AWS evidence or the code on
`main`), **[I]** inference, **[U]** unverified.

## 1. What is known

| Fact | Tag | Source |
| --- | --- | --- |
| RDS-managed master secret rotated 20 Nov 21:26:28 UTC; AWSCURRENT `5f35b6a0…` (also AWSPENDING), AWSPREVIOUS `b04015a3…`, 0 GetSecretValue | [V] | `2026-11-21-rds-secret-rotation-verification/01` (observed 04:23 UTC 21 Nov) |
| Rotation retries hourly and fails while the DB is stopped (16 failures 20 Nov 05:08 to 20:25 UTC) | [V] | same, file 01 |
| The DB was auto-started by RDS 20 Nov 21:11:51 UTC (7-day limit) and stopped 21 Nov 00:57:33 UTC by the late scheduled GitHub `down` (run 44846513554) | [V] | same, file 02 |
| At 04:23 UTC 21 Nov: NextRotationDate 27 Nov 23:59:59 UTC; AutomaticRestartTime 28 Nov 00:57:33 UTC | [V] | same, files 01 and 02 |
| Database backstop `cron(0 21 * * ? *)` and cleanup R `cron(5 21 * * ? *)`, both UTC; scheduled GitHub `down` `17 19 * * *` and `47 1 * * *`, which in practice runs hours late | [V] | `infra/aws/stack/envs/nonprod.tfvars`, `variables.tf`, `.github/workflows/aws-session.yml`; run times in the 20-21 Nov reports |
| Identity Stage E is running today (owner-approved 08:11 UTC; `up` run 44891901758 dispatched 09:56:04 UTC; own hard stop `down` by 12:56 UTC; H-20 P 13:25, S 13:55 UTC) | [V] | Stage E thread status, 09:56 UTC |

## 2. The timing changes today [I]

AutomaticRestartTime is always "seven days after the instance last stopped". Stage E starts the
database this morning and stops it again during its `down` (expected by about 13:00 UTC). From
that moment the **28 Nov 00:57:33 UTC** restart time in PR #148 is **stale**; the new restart
time should be about **28 Nov 13:00 UTC** (the Stage E stop time plus 7 days).

Consequences, all inference until the Stage E report or a read-only check records the new value:

- The rotation due 27 Nov 23:59:59 UTC will fail hourly for about 13 hours instead of about 1,
  then succeed after the auto-start (the 13 Nov and 20 Nov pattern). No access impact: the
  current password stays valid until the rotation completes.
- An auto-start at about 13:00 UTC falls **before** the 21:00 UTC database backstop and the 21:05
  cleanup R, so this time the backstop **will** stop it, after about 8 hours (about US$0.13 of
  db.t4g.micro [E]).
- If a later Testing session stops the database again before 28 Nov, the restart time moves again.

## 3. Options

| Option | What it does | Rotation | Cost | Risk |
| --- | --- | --- | --- | --- |
| A. Monitor only (current) | nothing new; check read-only after each auto-start | completes late, after the auto-start | worst case: a few hours of db.t4g.micro (cents) when the auto-start falls after 21:00 UTC | none to live services |
| B. Extra fixed-time database backstop (for example 03:00 UTC) | a second `rds:stopDBInstance` schedule | **can break rotation**: if it fires within about 15 minutes of an auto-start, the DB stops before the rotation runs, and rotation then waits another 7 days | saves at most hours | it also stops a database a session is using if a session runs past it; sessions are already bounded by H-20, so this adds overlap risk |
| C. Event-driven delayed stop (recommended design) | an EventBridge rule on the RDS event "DB instance is being started due to it exceeding the maximum allowed time being stopped" (RDS-EVENT-0154) starts a small Step Functions state machine: wait 2 h, then stop the database **only if** ECS has 0 running tasks in `munaxa-nonprod`, no H-20 P/S schedule is armed, and the secret's LastRotatedDate is after the event (or the wait has run twice) | guaranteed window of at least 2 h (two hourly retries) before the stop | bounds every auto-start to about 2 h | new IAM (rds:StopDBInstance on one ARN, ecs:ListTasks, scheduler:ListSchedules, secretsmanager:DescribeSecret) and one more resource to test; must never stop a session database (the guard) |
| D. Change rotation to a schedule aligned with auto-start | `rotation_rules` with a schedule expression | RDS-managed secrets rotate on their own schedule; aligning to an unpredictable restart time is not possible | none | fragile; not recommended |
| E. Rely on the scheduled GitHub `down` | already in place | unaffected | variable: it ran at 00:50 and about 09:15 UTC, 5 to 7.5 h late | GitHub schedules are best effort; it is a fallback, not a control |

## 4. Selected architecture

**Keep A now, and implement C later as a separate, owner-approved infrastructure change.**

- A is safe today: the worst case is a few hours of a micro instance, and nothing depends on
  rotation timing while Testing is idle.
- C is the only option that both bounds the running time and protects rotation. B is rejected
  because it can stop the database inside the rotation window and can collide with a session. D
  is not possible for RDS-managed secrets. E stays as the third line of defence.
- C must reuse the backstop's role pattern (trust `scheduler.amazonaws.com`/`states.amazonaws.com`
  with `aws:SourceAccount`), be nonprod only, and come with mocked Terraform tests and a dry-run
  input like cleanup R. Expected plan size: about 5 to 7 creates (rule, target, state machine,
  role, policy, attachment, log group) and 0 changes to existing resources [E].

Not implemented in this task, by design (owner instruction section 6).

## 5. Read-only verification checklist, 28 Nov 2026

Run with the AWS connector (read-only, metadata only). Times UTC (Amman = UTC+3).

**Window.** If Stage E stopped the database about 13:00 UTC on 21 Nov (to be confirmed from its
report), run the check **after 22:00 UTC on 28 Nov** (01:00 Amman 29 Nov), after the backstop.
If the database was **not** stopped by Stage E (restart time still 00:57:33), run it **after
01:30 UTC on 28 Nov** as PR #148 planned. Run the first check below on 22 Nov to know which.

1. `rds:DescribeDBInstances munaxa-nonprod-pg`: record `DBInstanceStatus` and
   `AutomaticRestartTime` (do this once on 22 Nov too, to replace the inferred time in section 2).
2. `rds:DescribeEvents` (source `munaxa-nonprod-pg`, last 48 h): the auto-start event, "Reset
   master credentials", and the stop.
3. `secretsmanager:DescribeSecret rds!db-c3ef5041-…`: `LastRotatedDate` after the auto-start,
   `NextRotationDate` about 7 days later.
4. `secretsmanager:ListSecretVersionIds` (with deprecated): exactly one AWSCURRENT, one
   AWSPREVIOUS; AWSCURRENT is a new id (not `5f35b6a0…`); AWSPREVIOUS is `5f35b6a0…`.
5. `cloudtrail:LookupEvents` for the secret: `RotationSucceeded` present; `GetSecretValue` 0;
   `RotateSecret` 0.
6. Database stopped again; which actor stopped it (backstop role, cleanup R or GitHub `down`).
7. ECS `munaxa-nonprod` 0 running; no ALB, NAT, EIP, EC2, ElastiCache.
8. Both cleanup alarms OK; cleanup R execution for 28 Nov SUCCEEDED.

**Never** call `GetSecretValue`, rotate, start, stop or modify anything during the check.
