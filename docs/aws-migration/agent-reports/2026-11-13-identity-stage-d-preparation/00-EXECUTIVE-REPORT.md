# 00. Executive report: Identity Testing stage D preparation

**Decision (13 Nov 2026, about 20:30 UTC): STAGE D PREPARATION COMPLETE — AWAITING OWNER APPROVAL.**

**One limit:** the real Terraform plan of the reviewed configuration was **not** generated. The plan workflow runs only on `main` (`aws-terraform.yml`, `if: github.ref == 'refs/heads/main'`), so the real plan of PR #121 can exist only after #121 is merged. This is the workflow's design, not a fault. It was not worked around (02).

Preparation and review only. Nothing was merged, applied, deployed, migrated, started or written in AWS by this task.

Legend: **[V]** independently verified (read-only AWS metadata, CloudTrail, GitHub, or a local test), **[R]** reported by an earlier report or the owner, **[U]** not verifiable yet.

## What was independently verified

| Area | Result |
| --- | --- |
| Stage C | `munaxa-nonprod/identity`, account 229251310592, eu-central-1: exactly two versions; `80914756-68cd-420d-8094-0fd49afe3492` = `AWSCURRENT` (created 19:40:16Z), `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` = `AWSPREVIOUS`; same KMS key; rotation not enabled. CloudTrail since 19:00: exactly one `PutSecretValue` [V]. The key id `mfa-nonprod-2026-11` and the secret's contents are the owner script's report [R] |
| PR #121 | head `30de485` (main merged in, docs only; diff vs main still exactly 2 files). Pin = 80914756, digests = approved 2db6ed9, kid `mfa-nonprod-2026-11`, `mfa_policy = off`, six declared changes unchanged. Independent review: **APPROVE**, 0 Critical/High/Medium, 3 Low (01) [V] |
| CI on `30de485` | "Format, validate, mocked plan tests" success; "Lint · Typecheck · Test · Build" success; façades success (05) [V] |
| Offline | fmt, validate, terraform test 12/67/17, plan-intent validate (nonprod 6, prod 0), reviewer's own mocked plan test plus negative control, mocked render (05) [V] |
| Real-state baseline | the last real nonprod plan (main `b2d93aa`, infra identical to today's main, 08:48 UTC) changes only the two declared docs-migrate items [V] |
| Live task definitions | the four Identity families are at revision 1 with the old images and `ad02f18e` pins, exactly what the four declared replacements change [V] |

## Expected real plan after the merge

6 changes, all declared: 4 task-definition replacements (identity, identity-migrate, identity-bootstrap, db-admin) + 1 create (`docs-migrate` secret container, no value) + 1 update (`docs_db_admin_execution` policy). No ECS service, ALB, network, security group, RDS, IAM-for-Identity, KMS, DNS, schedule or production change (02).

## What remains blocked

- Merge of #121 (owner decision M).
- The real plan, `check-plan-intent.sh --enforce` on it, and the apply (owner decisions P and A).
- The first Identity session (later, separate).

## New finding needing your attention

**N-1:** the Testing database restarted by itself at 16:26 UTC today (RDS's 7-day limit for a stopped instance) and was **running** at 20:15 UTC. The AWS backstop (enabled, 21:00 UTC daily) stops it; nothing else is running. Expected behaviour per the session design; its cost is in the running RDS total. Not changed by this task (03).

## Recommendation

Approve decision **M** (merge #121) and **P** (dispatch the plan-only run on main and approve its `aws-nonprod` environment gate). Claude then reviews the real plan and `--enforce` output and brings decision **A** (apply) as a separate yes/no (04).

## Files

| File | Contents |
| --- | --- |
| 01 | PR #121 independent review |
| 02 | Terraform plan readiness and why the real plan waits for the merge |
| 03 | risk register: S-1, S-2, S-3, budgets, N-1 and others |
| 04 | owner decisions M, P, A |
| 05 | validation evidence |
| `supporting/` | synthetic `--enforce` runs and the mocked render |

Related: [PR #121](https://github.com/munaxa/munaxa-platform/pull/121), [stage C revision 2](../2026-11-13-identity-stage-c-cli/) (PR #125), stage C execution `2026-11-13-identity-stage-c-execution/` ([PR #126](https://github.com/munaxa/munaxa-platform/pull/126), unmerged).
