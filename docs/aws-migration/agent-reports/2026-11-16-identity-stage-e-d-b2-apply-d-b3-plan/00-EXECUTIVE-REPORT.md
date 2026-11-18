# D-B2 apply and D-B3/D-PIN plan: executive report (16 to 18 Nov 2026)

**Status: D-B2 APPLIED AND VERIFIED — D-B3/D-PIN PLAN READY FOR OWNER REVIEW.**

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
| 8 | Risks and next decision | The next owner decision is the D-B3/D-PIN apply | File 03 §2 to §3 |
| 9 | Not performed | See the list below | File 03 §4 |

## Required statements

- The only AWS infrastructure write in this task was the owner-approved D-B2 apply of the saved plan `c02a40ae…8163`.
- No D-B3/D-PIN apply was performed.
- No secrets were created, read, updated or deleted.
- No Stage E activity occurred.
- No RDS start, ECS service or task, migration, bootstrap, DB-admin task, CloudFormation stack, C-8G run, alert subscription or cleanup execution took place.
- No production changes were made.
