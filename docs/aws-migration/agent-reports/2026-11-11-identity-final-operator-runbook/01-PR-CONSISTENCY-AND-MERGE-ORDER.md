# PR consistency (#87, #88, #89) and the proposed merge order (11 Nov 2026)

Workstream 4. Documentation only. **No PR was merged. No existing PR branch was edited.**

## 1. The problem

| # | Issue | Evidence |
| --- | --- | --- |
| X-1 | **Three "Latest" rows.** #87, #88 and #89 each insert a new top row marked **Latest** in `agent-reports/README.md` | Line 15 of the README on each PR head (`3b2e088`, `9e3cf41`, `d9d6865`) |
| X-2 | **Every pair conflicts.** All three insert at the same line; #87 and #88 also re-pad every row of the table (whitespace only, 77 lines each). Whichever merges second cannot merge without its branch being edited | `git diff -w` of the README on #87 and #88 shows only padding besides the new row |
| X-3 | Further PRs (workstreams 1, 2, 3, 5) would add the same conflict four more times | — |

## 2. The resolution used here

This PR is **the one integration PR**:

1. It carries the commits of #88 (1), #87 (4) and #89 (1), cherry-picked with `-x` onto `main`
   `49c51f3`, in that order. Every report and evidence file is **byte-identical** to the PR heads
   (checked with `git diff pr<N> HEAD -- <files>`: empty for all three). Only their README edits
   were dropped.
2. It adds this runbook folder.
3. It rewrites the README index **once**: one **Latest** row (this runbook), plain rows for #87,
   #88, #89, for workstreams 2, 3 and 5 (PR #92, PR #90, PR #91), without re-padding the table.
   and workstream 1 (PR #93), all in the same single index change.
4. Workstreams 1, 2, 3 and 5 agreed **not** to edit the README.
5. One file of the #87 content gets a dated banner here, documented below: the operator checklist
   (on `main` since #86). Nothing else in the #87, #88 or #89 files changes.

## 3. Content inconsistencies and how each is resolved

| # | Where | Inconsistency | Resolution |
| --- | --- | --- | --- |
| K-1 | #87 part 5, #89 section E | #87 recommends option A; #89 recommends option C | **Owner decision, 11 Nov: Option A.** Runbook 5.2, PR #91 |
| K-2 | #87 phase P (P-1) | Organisation named for refresh only; Origin not named for login | Runbook 8.2: login **and** refresh send `Origin` and `organisation: munaxa-group` (as #89 C.2 and the checklist 6.3 already do) |
| K-3 | #87 phase P, C-11 | HTTP-to-HTTPS listed as a probe check | Not testable from the task (no egress on 80, #89 BL-2). Runbook section 9: `DescribeListeners` configuration evidence |
| K-4 | #87 C-11, B-9; #88 F-3; #89 BL-4 | Probe runs in `identity-bootstrap`, which also injects `DIRECT_DATABASE_URL` | Separate task definition without database values (workstream 2). Runbook section 4 |
| K-5 | #87 P-2 | Pin and hash passed in the `RunTask` override; download from `main` "at a commit" | Pin fixed in Terraform `identity_probe_source`; only `PROBE_ALB_DNS` is overridden. Runbook sections 3 and 4.2 |
| K-6 | Checklist step 16 (on `main`) vs #87 B-11 | Checklist deletes the secret **before** the restart; #87 after the probe | After the probe (the probe reads it). Runbook section 11; banner on the checklist |
| K-7 | Checklist step 16 | "Never `down` with the secret present" | Replaced by PR #91 OA-5: `down` at the hard stop whatever the secret's state, then report R-1 |
| K-8 | Checklist step 9 | DNS record for `id.test` | Not used for the first session (#87 U-3). Runbook section 1 |
| K-9 | #88 section 6 | "Ruling on F-1 and F-2 … No change was made" | Superseded by #87 `02-LOG-FILTER-CORRECTION.md` (corrected pattern, 47 of 47) |
| K-10 | #87 A-0 / U-2 vs #88 section 3 | #87: if the connector log echoes parameters, do not run C-8. #88: the throwaway test was not run; L-A0 cannot be checked | L-A0 stays open and is accepted with Option A; stated in the authorization request. Runbook 5.2 |
| K-11 | #87 section 6, checklist section 9 | US$0.35 stated as the session ceiling | **Conditional**, not guaranteed: about US$1.00 if Claude loses control (#89 G, PR #90, PR #91). Runbook section 15 |
| K-12 | #89 BL-5 | Merge order "#88, then #87, then the probe PR" | Replaced by section 4 below |
| K-13 | #87 C-17, #89 G | One wake at T0 + 2 h 45 min | Two wakes (2 h 30 warning, 2 h 45 shutdown), hard stop at T0 + 3 h or 18:30 UTC. Runbook section 14 |
| K-14 | #89 heading vs README | #89 file is titled "final review before a deployment authorization request"; its row says "Final non-production deployment readiness review" | Row text kept, "Latest" removed |

## 4. Proposed merge order (for the owner to approve later)

Nothing here is approved. Each merge needs the owner's word after ChatGPT's review. The repository
allows squash merges only.

| Order | PR | Why here | Conflicts |
| --- | --- | --- | --- |
| 1 | PR #91, Option A custody review (workstream 5) | Docs only; cited by the runbook | none (new folder, no README) |
| 2 | PR #90, independent cleanup design (workstream 3) | Docs only; cited by the runbook | none |
| 3 | PR #93, workstream 1 probe | The pin `C` is its squash commit, so it must be on `main` first | #93 and #92 both edit `.github/workflows/aws-terraform.yml`; whichever merges second is updated to drop #93's single-file test step (#92's glob covers it). That update is a documented edit of the second PR's branch |
| 4 | PR #92, workstream 2 task definition (disabled by default, no plan change) | Needs nothing from 3 at merge time | see row 3 |
| 5 | **This PR** | Carries #87, #88, #89 and the single README update | none, if 1 to 4 do not touch the README |
| — | Close #87, #88, #89 as superseded by this PR | Their content is on `main` after 5 | — |
| 6 | Enable PR (`identity_probe_source` = `C`, `H`; expected changes = 1 create) | Needs `C` from 3 | — |
| 7 | Then, separately: the owner's Terraform plan/apply authorization (runbook I-4), and the session authorization (I-8) | Not merges | — |

**If the owner prefers to merge #87, #88 or #89 on its own first:** Claude rebases this PR; the
cherry-picked commits for that PR drop out and the README is resolved in this PR only. The other
two should then **not** be merged on their own, because each would conflict with the README again.

Steps 1 to 4 can be merged in any order among themselves, and 5 can wait until all four are done
(its README rows link to their folders).

## 5. Banner added in this PR

`2026-11-11-identity-first-session-operator-checklist/00-IDENTITY-FIRST-SESSION-OPERATOR-CHECKLIST.md`
gets one dated note under its title, pointing to the runbook for the Claude-executed session and
naming K-6, K-7 and K-8. Its commands, expected results and hard stops are unchanged.
