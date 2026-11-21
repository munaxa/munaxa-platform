# 06. Risks and next actions

As of 21 Nov 2026 04:30 UTC (07:30 Amman).

## Risks

| # | Risk | Severity | Evidence | Note |
| --- | --- | --- | --- | --- |
| R-1 | Next rotation due 27 Nov 23:59:59 UTC, but the stopped database only auto-starts 28 Nov 00:57:33 UTC. Rotation attempts will fail hourly on 27 Nov and complete only after the auto-start, i.e. late. | Low | Direct (dates); outcome is inference from the 20 Nov pattern | No access impact: the current password stays valid. Check read-only on 28 Nov after 01:30 UTC (04:30 Amman). |
| R-2 | The 21:00 UTC database backstop cannot stop a database that RDS auto-starts later; on 20 Nov only the late GitHub scheduled `down` stopped it (about 3 h 43 min running). | Low (cost, cents) | Direct | Any change (for example an extra backstop time) is an infrastructure change and needs a separate owner decision. Not proposed here. |
| R-3 | AWSPENDING label remains on the current secret version. | Informational | Direct; harmlessness is inference | Same as after the 13 Nov rotation. |
| R-4 | ALB security group allows 80/443 from the internet. | None while idle | Direct (no attachment) | Design intent for sessions, see file 02. |
| R-5 | Inherited, unchanged: Identity Testing image pin needs republish before Stage E (O-4 / D-I1 in the 20 Nov reports); Docs worker not fixed; test certificate renewal ineligible. | As recorded there | Not re-verified here | Tracked in the 20 Nov reports. |
| R-6 | The AWS connector sign-in expires often (five times between 20 Nov 21:25 and 21 Nov 04:01 UTC). | Process | Direct | Read-only checks may be delayed until the owner signs in again. |

## Owner decision needed now

**None.** The rotation succeeded and the environment is idle and protected. Optional owner
actions: review and merge #141, #142 and this PR (docs only, in that order).

## Exact next permitted action

A read-only connector check on 28 Nov 2026 after 01:30 UTC (04:30 Amman) confirming that the
27 Nov rotation completed after the automatic start and that the database was stopped again.
No write is needed or proposed.

## Explicitly not recommended

Starting Testing, Stage E, any manual `up` or `down`, any rotation, restore or database
start/stop. **Stage E remains NOT AUTHORIZED.**

## Confirmation

During this work Claude made no AWS change, ran no Terraform plan or apply, dispatched no
workflow, ran no Step Functions execution, deployed nothing, ran no migration, read no secret
value and merged no PR.
