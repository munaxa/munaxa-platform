# D-B2 apply and D-B3/D-PIN plan: executive report (16 to 18 Nov 2026)

**Status (corrected 18 Nov 2026): D-B2 APPLIED AND VERIFIED — D-B3/D-PIN APPLIED AND VERIFIED (run 44267788619, follow-up plan run 44268194074: no changes).**

> **Correction note, 18 Nov 2026.** The first version of this report (16 Nov) ended at
> "D-B3/D-PIN PLAN READY FOR OWNER REVIEW", and the update at 08:36 UTC on 18 Nov added the apply
> without changing that status line, row 8 or the index row. This note and the edits marked
> "corrected" bring them in line with file 04. What was known on 16 Nov is kept in files 02 and 03,
> each with a dated status note. Applied means the infrastructure exists. It does not mean any
> operation has run: no alert subscription, no cleanup execution and no Stage E (see
> "What is live now" in file 04 §4). Follow-up report:
> `2026-11-18-identity-post-d-b3-verification-next-gates/`.

**Update, 18 Nov 08:36 UTC.** With the owner's approval, D-B3/D-PIN was applied:

- Run 44267788619: the enforced plan matched the 12 declared changes exactly, and the saved plan was applied.
- The follow-up plan, run 44268194074, shows `No changes`.
- PR #136 temporarily ignores the `picomatch` advisory GHSA-fc5q-39xc-vjpf, which has no fix.

See file 04.

**Owner instruction.** 16 Nov 2026, 12:38 UTC: "Merge D-B2 Report, Apply Approved Saved Plan, Prepare D-B3/D-PIN". It carried a limited approval to apply the exact D-B2 saved plan, `c02a40ae…8163`.

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | PR #134 (D-B2 report) | Squash-merged by the owner, 16 Nov 12:37:58 UTC, as `19fa5bc60182f2538268dfff06b45d392ba32deb`. The report folder is on `main`. The apply script on `main` hashes to the approved `efa8c793…190a` | File 01 §1 |
| 2 | D-B2 apply | Run by the owner in CloudShell as root, 16 Nov 12:40:00 to 12:40:59 UTC, with the reviewed script. Applied the saved plan file only, and every check passed. Result: `Apply complete! Resources: 2 added, 2 changed, 0 destroyed.` | File 01 §2 |
| 3 | State counts | Bootstrap state: 68 resources before, 70 after. New state object at 12:40:34 UTC | File 01 §3 |
| 4 | Post-apply plan | Run with `-var testing_session_cleanup=true -detailed-exitcode`: `No changes.` | File 01 §3 |
| 5 | IAM verification | The live nonprod boundary, session-read policy and new cleanup policy equal the reviewed code. The cleanup policy is attached to `munaxa-shared-deployer-nonprod`, which now has 4 managed policies | File 01 §4 |
| 6 | D-B3/D-PIN plan | Plan-only dispatch of `aws-terraform.yml`, run 43868859420 at `19fa5bc`. Started 16 Nov 12:41 UTC; the owner approved the plan job 18 Nov ~08:14 UTC. Result: `Plan: 9 to add, 2 to change, 1 to replace, 0 to destroy.` The intent checker reported "The plan matches the declared changes exactly (12 resource action(s))." Nothing was applied, and in plan mode the workflow has no apply job | File 02 |
| 7 | Workflow and scheduled shutdown | The scheduled Testing `down` keeps failing at "Plan the switches", most recently in run 44217528747 (the "Deployment failed" the owner saw on 18 Nov 08:16 UTC). Its database stop succeeded each time: `database munaxa-nonprod-pg: stopped`. The cause is in file 03 §1 | File 03 §1 |
| 8 | Risks and next decision | On 16 Nov the next owner decision was the D-B3/D-PIN apply. The owner approved it on 18 Nov 08:31 UTC, and it was applied in run 44267788619 (file 04). Corrected 18 Nov: the next decisions are in `2026-11-18-identity-post-d-b3-verification-next-gates/` | File 03 §2 to §3, file 04 |
| 9 | Not performed | See the list below | File 03 §4 |

## Required statements

- The only AWS infrastructure write in this task was the owner-approved D-B2 apply of the saved plan `c02a40ae…8163`.
- D-B3/D-PIN was applied only on 18 Nov, after the owner's approval, through the workflow's enforced saved-plan path (file 04). Before that approval, no D-B3/D-PIN apply was performed.
- No secrets were created, read, updated or deleted.
- No Stage E activity occurred.
- No RDS start, ECS service or task, migration, bootstrap, DB-admin task, CloudFormation stack, C-8G run, alert subscription or cleanup execution took place.
- No production changes were made.
