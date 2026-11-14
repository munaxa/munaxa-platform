# 00. Executive report: Identity Testing stage D, merge, real plan and apply

**Final result: STAGE D APPLIED AND VERIFIED (13 Nov 2026, 21:45 UTC).** Nothing runs: 0 ECS services, 0 tasks, database stopped at the post-apply verification (06).

> **Correction (14 Nov 2026).** Earlier versions of this file carried the 21:29 status ("plan complete, awaiting separate owner approval for apply") and the sentence "Apply was not authorized and was not done" directly under the 21:45 update, and the PR description still said nothing was applied. Those statements were true at 21:29 and were superseded when the owner approved decision A at 21:42. They are kept below as dated history. Details: `2026-11-14-identity-stage-d-correction-and-stage-e-readiness/01-STAGE-D-CORRECTIONS.md`.

## Status history (UTC, 13 Nov 2026)

| Time | Status |
| --- | --- |
| 21:29 | Stage D plan complete. Apply not yet authorized and not performed; awaiting a separate owner decision A |
| 21:42 | Owner approved decision A (one `action=apply` dispatch) |
| 21:45 | Apply run 43513076111 succeeded; verified read-only at 21:46–21:48 (06). Stage D DONE |

## Verified facts

- PR #121 was merged at the reviewed head `30de485`; merge commit `68fa6f93fd55c2480f3a8e6e486b5957539eaafa` (01).
- Plan-only run [43509702203](https://github.com/munaxa/munaxa-platform/actions/runs/43509702203) succeeded; its apply job was skipped and it saved no plan (02).
- Apply run [43513076111](https://github.com/munaxa/munaxa-platform/actions/runs/43513076111) completed successfully. Its plan job ran `check-plan-intent.sh --enforce`, which enforced exactly the six declared resource actions, then saved the plan (SHA-256 `18786f25…e537b`). The apply job applied only that saved plan, for the same commit `68fa6f9`, after checking its age and hash (06).
- Post-apply CloudTrail showed exactly the six expected write actions, all by `gha-run-43513076111`, with no errors (06).
- The four task-definition families (`identity`, `identity-migrate`, `identity-bootstrap`, `db-admin`) have a new revision 2; revision 1 of each remains ACTIVE for rollback (06).
- The `munaxa-nonprod/docs-migrate` secret container was created without a value (no version) (06).
- No ECS service or task was started. No migration, bootstrap or DB-admin task was run. Registering a task definition starts nothing.
- RDS `munaxa-nonprod-pg` was stopped at the post-apply verification (06).
- No production or management-account change was made.

| Decision | Outcome |
| --- | --- |
| M: merge PR #121 | **Merged** 21:19 UTC by squash at the reviewed head `30de485`. Merge commit **`68fa6f93fd55c2480f3a8e6e486b5957539eaafa`**; its tree equals the reviewed head (01) |
| P: one plan-only run | **Run [43509702203](https://github.com/munaxa/munaxa-platform/actions/runs/43509702203)**, dispatched 21:19 and approved by the owner at the `aws-nonprod` gate. The plan job **succeeded** at 21:29. No plan was saved and the apply job was **skipped** (02) |
| A: one apply run | **Run [43513076111](https://github.com/munaxa/munaxa-platform/actions/runs/43513076111)**, approved by the owner at 21:42; the owner then approved both `aws-nonprod` gates. Plan job `--enforce` matched 6; saved plan applied on `68fa6f9` at 21:45. **Success** (06) |

## Real plan (run 43509702203; run 43513076111 produced the same six actions)

**Plan:** 1 to add, 1 to change, 4 to replace, 0 to destroy. Intent check: **"The plan matches the declared changes exactly (6 resource action(s))."**

| Address | Declared | Actual |
| --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | delete, create | replace |
| `module.migrate["identity"].aws_ecs_task_definition.this` | delete, create | replace |
| `aws_ecs_task_definition.identity_bootstrap[0]` | delete, create | replace |
| `aws_ecs_task_definition.db_admin[0]` | delete, create | replace |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | create |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | update (`policy`) |

- Only `container_definitions` forces the four replacements.
- No database, network, security group, IAM role, ECS service, ALB, DNS, schedule or production change.
- No destroy outside the four task-definition replacements, which keep their old revisions.

## Other checks (as recorded at 21:20–21:3x, before the apply)

- **Database:** stopped. The backstop stopped it at 21:00:48 UTC and RDS reported it stopped at 21:07 (03).
- **Risks:** S-1, S-2 and S-3 are open and non-blocking. B-1 (the $10 alert-only budget) is open and non-blocking. B-2 is fine. N-1 is resolved for now (03).

## Recommendation and next step

At 21:29 the plan was judged **eligible for apply** (04) and decision A was requested. The owner approved it at 21:42 and the apply is done (06).

**Next:** stage E, the first Identity session (session up, db-admin, migrate, bootstrap). It needs a separate owner decision; nothing in stage D authorizes it.

## Files

| File | Contents |
| --- | --- |
| 01 | merge verification |
| 02 | the real Terraform plan |
| 03 | risk update and database state |
| 04 | the owner's apply decision |
| 05 | validation evidence |
| 06 | apply result and verification (added after decision A) |

Related reports:
- `2026-11-13-identity-stage-d-preparation/` (PR #127)
- `2026-11-13-identity-stage-c-execution/` (PR #126)
- `2026-11-13-identity-stage-c-cli/` (PR #125)
