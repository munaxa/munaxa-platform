# 10. Remaining risks, exact next owner decisions, actions not performed

> **Status note, 18 Nov 2026 about 14:30 UTC.** This file was written before D-B2R (10:00–10:35 UTC) and is kept as that record.
> Since then:
> - PR #137 was squash-merged with the owner's approval as `a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd`, at 13:24 UTC.
> - The owner plan passed at 13:33 UTC (file 12).
> - The owner applied that reviewed plan at 13:35–13:37 UTC: 0 added, 1 changed, 0 destroyed; post-apply plan no changes; 70 resources (VERIFIED FROM OWNER LOG, file 13).
> - Claude re-read the live policy: version `v3` contains `states:ListStateMachineVersions` (VERIFIED LIVE — READ ONLY, file 13).
> - Still NOT VERIFIED: a scheduled `down` passing "Plan the switches" (file 14).
> - Since then Claude merged PR #137 on the owner's explicit yes, and read-only AWS calls were made from 12:41 UTC (files 11, 13–15). Sections 1–3 below are the 10:35 UTC record; the current version is file 15.


## 1. Risks and blockers

| Id | Risk or blocker | Severity | Status |
| --- | --- | --- | --- |
| R-1 | Every scheduled `down` fails at "Plan the switches" (`states:ListStateMachineVersions`), and so would any `up` | Medium: no cost exposure today, because the database stop and the backstop work and no session exists. But the switch path cannot remove an ALB until it is fixed | **BLOCKED** until D-B2R is applied (PR #137 + owner apply, file 04) |
| R-2 | The live AWS state was not read today | Medium | **BLOCKED** on the owner's AWS connector sign-in (file 03 §5) |
| R-3 | Cleanup alarms notify nobody | Medium | Until D-B5 is confirmed (file 05). R's first real run at 18 Nov 21:05 UTC runs without alert delivery |
| R-4 | H-20 is a procedural gate, not enforced by `aws-session.yml` `up` | Medium | Recorded (file 07 row 9). A code option exists, needing a separate approval |
| R-5 | The `not-run` alarm may be in ALARM until the first SUCCEEDED execution. If R fails tonight, `failed` goes to ALARM | Low | NOT VERIFIED. Read it after R |
| R-6 | The first real run of R is the first time the cleanup role's delete, scale and stop permissions run against AWS (only on an idle stack, so there is nothing to delete) | Low | Automatic per the D-B3 design. Read its result (file 07) |
| R-7 | The `envs/nonprod.expected-changes.json` declaration still lists the 12 applied changes | Low: a report-mode plan warns, and an enforced plan for any new change fails until it is replaced | The next stack configuration PR must replace it |
| R-8 | Every later bootstrap plan or apply must pass `-var testing_session_cleanup=true` | High if missed: it would remove D-B2 | Both D-B2R scripts pass it, and the plan check refuses any other plan |
| R-9 | `picomatch` advisory ignored, with no fix released | Low (development tooling only, file 08) | Monitor. Remove when a fix exists. Re-review 18 Dec 2026 |
| R-10 | The identity-bootstrap task definition reads `munaxa-nonprod/identity-operator`, which does not exist yet (C-8G) | Low (no task is authorized) | Unchanged |
| R-11 | Carried forward: S-2 (RDS master secret AWSPENDING), S-3 (test certificate renewal), B-1 (account budget exceeded on 14 Nov), B-H1 (bounded bootstrap window) | as before | Unchanged, not re-checked |

## 2. Exact next owner decisions, in order

Each is a plain yes or no. Claude does the work. The owner only clicks or approves where noted.

1. **Reconnect the AWS connector** (claude.ai, Settings, Connectors). This is an owner action, not a decision. It lets Claude finish the read-only check and read R's first result.
2. **D-B2R yes/no:** merge PR #137, then run the plan script in CloudShell (plan only).
3. **D-B2R apply yes/no**, after Claude has reviewed that plan log: run the apply script with the reviewed plan SHA-256.
4. **D-B5 yes/no:** Claude subscribes `alert@munaxa.com`, and the owner clicks "Confirm subscription" in the e-mail.
5. **D-B4 yes/no:** Claude runs the idle dry run, before 20:40 UTC on its day.
6. **Not a decision:** after R's next real success, Claude runs H-20 `gate` read-only and reports.
7. **Stage E (D-E):** remains NOT AUTHORIZED. Not requested now.

Decisions 2, 4 and 5 are independent and can be given together. Decision 3 needs the plan log
first.

## 3. Actions explicitly not performed in this task

- **Terraform:** no plan or apply against AWS, including the bootstrap. No dispatch of any workflow.
- **AWS:** no read at all (connector blocked) and no write: no IAM, KMS, Secrets Manager, CloudFormation, SNS, Step Functions, Scheduler, ECS or RDS change.
- **SNS:** no subscription created or confirmed, and no test message.
- **Cleanup:** no dry run and no real cleanup execution. Schedule R and the 21:00 UTC backstop were not modified.
- **Services and data:** no RDS start, no ECS service or task, no Identity migration, bootstrap or DB-admin task.
- **Secrets:** no operator secret and no C-8G. No secret value read, and no credential, token or password handled.
- **Gates:** no H-20 run, bypass or modification, and no Stage E.
- **Production:** no change.
- **GitHub:** no PR merged or approved by Claude. The owner said not to merge automatically for this task.
- **Dependencies:** the picomatch exception was not broadened, and no dependency was upgraded or overridden.
