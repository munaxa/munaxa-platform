# 01. Stage D report corrections (PR #128)

Owner request, 14 Nov 2026 11:57 UTC: correct the stage D execution report and the PR #128 description so they agree with the recorded workflow evidence.

## What was wrong

| # | Where | Statement | Why it was wrong |
| --- | --- | --- | --- |
| C-1 | `2026-11-13-identity-stage-d-execution/00-EXECUTIVE-REPORT.md`, line 3 | "STAGE D PLAN COMPLETE — AWAITING SEPARATE OWNER APPROVAL FOR APPLY." | True at 21:29 UTC, superseded at 21:42 when the owner approved decision A. It was still the headline |
| C-2 | same file, line 7 | "Apply was not authorized and was not done. Nothing was applied, deployed, migrated, started or written in AWS." | Directly under the 21:45 update saying the apply ran. It described the 21:29 state; after 21:45 the first half was false. The second half (nothing deployed, migrated or started) stayed true; "nothing written in AWS" became false (six writes) |
| C-3 | same file, "Recommendation" | "Next is decision A" | Decision A was already approved and applied |
| C-4 | PR #128 title and description | "(no apply)"; "STAGE D PLAN COMPLETE — AWAITING SEPARATE OWNER APPROVAL FOR APPLY. Nothing was applied." | Never updated after the apply |
| C-5 | `05-VALIDATION-EVIDENCE.md`, "Not performed" | "No Terraform apply; no `action=apply` dispatch; no second dispatch" without a date | Correct for decisions M and P only; read as a final statement it contradicted 06 |
| C-6 | `05-VALIDATION-EVIDENCE.md`, timeline | ended at 21:3x | The apply timeline (21:42–21:48) was only in 06 |
| C-7 | `README.md` index row for the stage D folder | ended "Next: decision A (one apply dispatch)" | Same as C-3 |

`02-REAL-TERRAFORM-PLAN.md` (run 43509702203: apply job skipped, no plan saved) and `06-APPLY-RESULT.md` were checked and are correct as written. `03-RISK-UPDATE.md` and `04-OWNER-APPLY-DECISION.md` were correct for their time but did not say so.

## What was changed (commit `9578664` on PR #128's branch, plus the PR description)

| File | Change |
| --- | --- |
| `00-EXECUTIVE-REPORT.md` | New headline "STAGE D APPLIED AND VERIFIED (13 Nov 2026, 21:45 UTC)"; a dated correction note; a status-history table (21:29, 21:42, 21:45) that keeps the superseded 21:29 status; a "Verified facts" list (below); decision A row in the outcome table; the pre-apply checks are labelled as such; the next step is stage E |
| `03-RISK-UPDATE.md` | States that its checks were made before the apply, and points to the post-apply register |
| `04-OWNER-APPLY-DECISION.md` | One outcome line: approved 21:42, applied 21:45 by run 43513076111; the rest is the 21:29 request |
| `05-VALIDATION-EVIDENCE.md` | Apply rows added to the timeline (21:42, 21:43:38–21:44:24, 21:44:39–21:45:15, 21:46–21:48); "Not performed" scoped to decisions M and P, with a note that decision A superseded it in part |
| `README.md` (index row) | "Decision A approved 21:42 and applied 21:45; nothing started, no migration, bootstrap or db-admin run. Next: stage E (separate owner decision)" |
| PR #128 title and description | Title "… merge, real plan and apply (applied and verified)"; description rewritten to the verified facts, with a correction note |

No timestamp, run id, SHA, hash or evidence reference was changed or removed.

## The facts the corrected report now states, with their evidence

| Fact | Evidence |
| --- | --- |
| PR #121 merged at reviewed head `30de485`; merge commit `68fa6f93fd55c2480f3a8e6e486b5957539eaafa` | 01 of the stage D folder: `expectedHeadSha`, `git diff 30de485 68fa6f9` empty |
| Plan run 43509702203 succeeded | 02: plan job success 21:29:02–21:29:40, apply job skipped |
| Apply run 43513076111 completed successfully | 06: plan job 21:43:38–21:44:24, apply job 21:44:39–21:45:15, both success |
| The apply used the saved plan for the same commit | 06: plan saved with SHA-256 `18786f25…e537b`; the apply job checked the commit, the age and the hash, then "Applied the saved plan of commit 68fa6f9…" |
| The intent check enforced exactly six declared resource actions | 06: `--enforce` output "The plan matches the declared changes exactly (6 resource action(s))." |
| Exactly six expected CloudTrail write actions after the apply | 06: `CreateSecret` 21:45:09, `PutRolePolicy` 21:45:10 (us-east-1 trail), `RegisterTaskDefinition` ×4 21:45:11, all `gha-run-43513076111`, no error |
| Four families have a new revision; old revisions remain for rollback | 06; re-checked on 14 Nov in 02 of this folder |
| docs-migrate secret container created without a value | 06 (`CreateSecret` with no value, no version); re-checked in 02 of this folder |
| No ECS service or task started; no migration, bootstrap or db-admin task run | 06 (0 services, 0 tasks); re-checked in 02 of this folder |
| RDS stopped at the post-apply verification | 06 |
| No production change | the only writes were the six above, all in the nonprod stack |

## Checks of the corrected text

- `00`, the PR description, `06` and the index row now give the same status: applied and verified, nothing running, stage E next.
- No file says that an Identity service or task is running. Every mention of the new revisions says "registered" or "ACTIVE revision", which is a task-definition state, not a running task.
- The markdown and redaction check (07) passed on all eight files of the stage D folder: 0 problems.
