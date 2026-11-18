# 01. PR and commit history, baseline

**Baseline:** `main` at `3453f13637907bfc0cd39ace12a0672e5f1e1bf7`, read from GitHub on 18 Nov 2026
at about 10:00 UTC. All merges below are squash merges, as the repository allows only those.
The times are the commit times in UTC.

| PR | Title (short) | Merge commit on `main` | Merged (UTC) | Kind |
| --- | --- | --- | --- | --- |
| #129 | Stage D correction and stage E readiness | `9752146f48f56972c72fd1808ce240300c2f1196` | 15 Nov 10:39 | docs |
| #131 | L-A0 redesign, operator password through CloudFormation (C-8G) | `ac0ae60f24ed28419532d683a8da3517dabe6f3d` | 15 Nov 10:07 | code, nonprod config |
| #132 | Stage E nonprod config: cleanup on (D-B3), probe pinned (D-PIN), L-A0 declaration | `3ea00f93f6a0e9dfd96664128db58f7c81244024` | 15 Nov 10:21 | config |
| #133 | Report: Stage E owner decisions | `09b44acaeea4c3d0474845ea4578d14a1d96461d` | 15 Nov 09:35 | docs |
| #134 | Report: D-B2 bootstrap plan procedure (plan only) | `19fa5bc60182f2538268dfff06b45d392ba32deb` | 16 Nov 12:37 | docs + owner scripts |
| #136 | Temporarily ignore GHSA-fc5q-39xc-vjpf (picomatch) | `d4d1ff23a85770f1c242f68758de30ea2632e866` | 18 Nov 08:49 | dependency config + docs |
| #135 | Report: D-B2 applied, D-B3/D-PIN plan, then apply (file 04) | `3453f13637907bfc0cd39ace12a0672e5f1e1bf7` | 18 Nov 09:04 | docs |

PRs opened by this task (as of 10:35 UTC both unmerged; #137 was merged at 13:24 UTC on the owner's yes as `a976b1af9e7fbfb003e0ed9d0dea8235e015f1cd`; this report's PR stays unmerged):

| PR | Branch | Kind |
| --- | --- | --- |
| #137 | `claude/project-thread-l55y5v-fix` | **Code:** bootstrap IAM fix for the scheduled `down` (file 04) |
| this report's PR | `claude/project-thread-l55y5v` | Documentation, plus owner and connector procedure scripts in `supporting/` that have not been run |

## What `main` contains for Testing (from the code, not from AWS)

- **Bootstrap (`infra/aws/bootstrap`):** D-B2's cleanup permissions, behind `-var testing_session_cleanup=true`. The last bootstrap code applied is `9752146` (D-B2 apply, 16 Nov). Since then, `main` has not changed the bootstrap: `git diff 9752146 3453f13 -- infra/aws/bootstrap` is empty.
- **Stack (`infra/aws/stack`), nonprod:**
  - `session_cleanup_enabled = true`: state machine, schedule R `cron(5 21 * * ? *)` UTC with `{"dryRun":false}`, SNS topic and policy, two alarms, cleanup and backstop IAM;
  - probe pinned to `2f6d443`;
  - L-A0 identity-bootstrap task definition.
  - `envs/nonprod.expected-changes.json` still declares the 12 applied changes. As file 04 of the 16 Nov report notes, the next configuration PR must replace it.
- **Workflows:**
  - `aws-session.yml`: schedules `17 19 * * *` and `47 1 * * *`. Its database stop runs as a separate job.
  - `aws-terraform.yml`: enforced plan, then the saved-plan apply.
