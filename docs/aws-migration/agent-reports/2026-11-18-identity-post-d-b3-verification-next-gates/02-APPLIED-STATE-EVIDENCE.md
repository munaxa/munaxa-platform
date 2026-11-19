# 02. D-B2 and D-B3/D-PIN applied-state evidence

> **Status note, 18 Nov 2026 about 14:45 UTC.** This file is kept as written at about 10:35 UTC, when the AWS connector was signed out.
> - The owner reconnected it at 12:41 UTC.
> - Live values were read later, read-only, at 12:43 UTC and 14:20 UTC (files 11 and 14): state machine ACTIVE, 0 executions, R ENABLED, `-failed` OK, `-not-run` ALARM since 09:19 UTC, no P/S schedule, ECS 0/0, no ALB, RDS stopped, topic 0 subscriptions.
> - D-B2R was applied at 13:37 UTC (file 13).

**What this file proves.** These are historical facts, checked against the merged reports and the
GitHub Actions records. They do not prove the live AWS state today. A read-only AWS check was
planned, but it could not run: the AWS connector needed a new sign-in from about 10:03 UTC on 18 Nov
(file 03 §5).

| # | Fact | Evidence checked in this task | Status |
| --- | --- | --- | --- |
| 1 | D-B2 applied with the approved saved plan `c02a40ae…8163` (2 added, 2 changed, 0 destroyed; 68 → 70 resources; post-apply plan no changes; live IAM = code) | Report `2026-11-16-…/01-D-B2-APPLY-EVIDENCE.md`. The owner's CloudShell log is quoted there. That run is not on GitHub Actions, so the report is the only record | **VERIFIED from the report** (owner-run log). Not re-checked live |
| 2 | The session-read policy size after D-B2 is 1,470 characters | This task rendered `main` offline: 1,470 characters, the same as the live size recorded on 16 Nov | **VERIFIED offline** (code), consistent with the report |
| 3 | D-B3/D-PIN applied through the enforced plan and saved-plan workflow | [Run 44267788619](https://github.com/munaxa/munaxa-platform/actions/runs/44267788619): `workflow_dispatch` at `19fa5bc`, conclusion **success**. Job "Plan nonprod (apply)" 08:32:43–08:33:20 UTC (success). Job "Apply nonprod (the saved plan only)" 08:33:38–08:34:08 UTC (success). Its log shows `EXPECTED: b43440ef7a78244a6fb7ae692f7a44fb6f6be56247b73f6893f7d763a5ebf967` and "Applied the saved plan of commit 19fa5bc60182f2538268dfff06b45d392ba32deb." | **VERIFIED** (GitHub Actions) |
| 4 | The plan matched the 12 declared changes (9 add, 2 change, 1 replace, 0 destroy) | Report file 04 §1 and the plan-only run 43868859420 (file 02 of that report) | **VERIFIED from the reports** |
| 5 | Follow-up plan: no changes | [Run 44268194074](https://github.com/munaxa/munaxa-platform/actions/runs/44268194074): `workflow_dispatch` at `19fa5bc`, 08:34:42–08:36:02 UTC, conclusion **success**. The report quotes `Plan: 0 to add, 0 to change, 0 to replace, 0 to destroy. No changes.` | **VERIFIED** (run conclusion + report) |
| 6 | No production change | The only applies since 15 Nov were D-B2 (bootstrap, nonprod-only statements, prod boundary unchanged per its review) and the `nonprod` stack apply. No `aws-terraform.yml` run with `environment=prod` appears in the reports | **VERIFIED from records**. Not checked live |
| 7 | No Stage E execution | No owner authorization exists (D-E is NO since 15 Nov), and no report records an `up`. The four `aws-session.yml` runs since 15 Nov are all scheduled `down` runs (file 03) | **VERIFIED from records**. The live ECS state is NOT VERIFIED today (file 03 §5) |

## What the applied infrastructure is, and what it is not

- **Exists (from the D-B3 apply):**
  - state machine `munaxa-nonprod-session-cleanup`;
  - its role;
  - schedule R `munaxa-nonprod-session-cleanup-daily`;
  - topic `munaxa-nonprod-session-cleanup-alerts` and its policy;
  - alarms `munaxa-nonprod-session-cleanup-failed` and `munaxa-nonprod-session-cleanup-not-run`;
  - the backstop's start permission;
  - the pinned probe task definition;
  - the L-A0 identity-bootstrap task definition.
- **Has not run, or was not created** (no record anywhere):
  - no alert subscription;
  - no dry run;
  - no manual cleanup execution;
  - no operator secret (C-8G);
  - no RDS start, ECS service or task, migration, bootstrap or DB-admin run;
  - no Stage E.
- **Will run on its own:** schedule R is part of the applied design. It runs a **real**
  (`dryRun false`) cleanup every day at 21:05 UTC. Its first run is due 18 Nov 21:05 UTC. Whether it
  ran, and its result, can only be read from AWS. See file 07.
