# Config A1: real plan, apply and post-apply plan

- Date: 10 Nov 2026, 06:04 to 06:14 UTC
- Part of [`00-IDENTITY-CONFIG-A1-INPUTS.md`](00-IDENTITY-CONFIG-A1-INPUTS.md) (inputs PR #73)
- Who did what:
  - The owner merged #72 and #73 (through Claude, on the owner's "merge all").
  - The owner dispatched every workflow run below and approved the `aws-nonprod` environment.
  - Claude only read the run logs. Claude made no AWS call.
- Labels: **[V]** verified from the run logs

## Verdict

**Config A1 is applied and verified by Terraform.** Testing now holds the 22 declared Identity
resources. A follow-up plan shows no changes. **Nothing is running yet:**
- no ECS service, no ALB, no task started;
- the database is stopped;
- no migration or bootstrap has run.

| Stage | Status |
| --- | --- |
| Prepared | Done (#69, #73) |
| Merged | Done: #72 `e63cc0d`, #73 `67904bc` (06:03 UTC) |
| Planned (real AWS plan) | Done: run 42766116306, 22 / 0 / 0 / 0, exact match [V] |
| Applied | Done: run 42766582624, saved plan applied without errors [V] |
| Verified (post-apply plan) | Done: run 42766964719, **No changes** [V] |
| First Identity session (runbook steps 8 to 23) | **Not started**, needs separate owner approval |

## 1. Real plan: run 42766116306 (06:04 to 06:05 UTC)

- Dispatched with environment `nonprod` and action `plan`, on `main` at `67904bc`.
- Authentication: GitHub OIDC to `munaxa-shared-ci-nonprod`, then `munaxa-shared-deployer-nonprod`. These are the normal roles; no root and no keys.
- Summary: **"Plan: 22 to add, 0 to change, 0 to replace, 0 to destroy."** and "No resource is updated or replaced."
- Intent check (`--report`): **"The plan matches the declared changes exactly (22 resource action(s))."**
- The 22 planned addresses are identical to `envs/nonprod.expected-changes.json` and to the mocked
  list in `supporting/inputs-pr-mocked-plan-addresses.txt`.
- No warnings.

Claude's review against the stop conditions (00 report §8): none applies.
- No database, VPC, subnet, route, ACM, backstop, scheduler, ALB, service or production resource.
- No Control, Work, School or Docs resource, and no `docs_db_admin`.
- IAM: only the 3 new execution roles and their 3 inline policies:
  - `identity_bootstrap_execution`;
  - `module.identity[0]` execution;
  - `module.migrate["identity"]` execution.
- No update, replacement or destroy.

## 2. Apply: run 42766582624 (06:09 to 06:10 UTC)

- Dispatched with environment `nonprod` and action `apply`, on `67904bc`. The owner approved the `aws-nonprod` environment.
- Plan job, in strict `--enforce` mode: the same 22 / 0 / 0 / 0, and "The plan matches the declared changes exactly (22 resource action(s))".
- The saved plan was stored with sha256 `3e0f3b8d547449e30a18ad8a2d5983ba21be827f2ea6f52688e02833d7d378a4`.
- Apply job:
  - "The saved plan is this commit's and fresh": passed.
  - "Fetch and verify the saved plan": the hash matched.
  - `terraform apply` of the saved plan: success at 06:10:53 UTC. It printed "Applied the saved plan of commit 67904bc…".
  - No warnings.
  - No AccessDenied and no error.

The workflow keeps Terraform's own apply output out of the public log, so the "22 added" line is not
printed. The post-apply plan (section 3) is the proof that all 22 now exist in state.

## 3. Post-apply plan: run 42766964719 (06:12 to 06:13 UTC)

- Dispatched on `67904bc`. It was dispatched with action `apply`, but the plan found nothing to do, so the apply job was skipped and nothing was applied.
- Summary: **"Plan: 0 to add, 0 to change, 0 to replace, 0 to destroy." "No changes."**
- The intent check lists the 22 declared creates as "declared but not in the plan", followed by a warning that the plan does not match the declaration. This is expected: all 22 exist now, so there is nothing left to create. The warning is report-only and applied nothing.

## 4. What exists now

| Resource | Notes |
| --- | --- |
| Task definitions: `module.identity[0]`, `module.migrate["identity"]`, `identity_bootstrap[0]`, `db_admin[0]` | Registered. Images by digest; secrets as `valueFrom` references with the pinned version ids |
| 3 execution roles and 3 inline policies | Identity, Identity migrate, identity-bootstrap |
| 2 log groups | Empty |
| 2 security groups and 7 rules, plus the ALB-to-Identity egress rule | No traffic: nothing is running |

Idle cost: none. Task definitions, roles, security groups and empty log groups are free.

## 5. Not yet verified

- **Secret version ids.** They are only used when a task starts. A wrong id would show up at the first
  `db-admin` or `identity-migrate` run as `ResourceInitializationError` (runbook steps 10 and 11).
- **The public and private key pair match.** First proven at runbook step 19, when a token signed by
  Identity verifies with the committed public key.
- **No live AWS read was made in this task.** Everything above comes from the GitHub Actions logs of
  the owner's runs.

## 6. Next owner action

Phase 2 of [`02-IDENTITY-ONLY-RUNBOOK.md`](../2026-11-09-identity-config-a1-preparation/02-IDENTITY-ONLY-RUNBOOK.md),
steps 8 to 23. It starts with `aws-session.yml` **up**, which creates the ALB and the Identity
service and starts the database. Then come DNS, `db-admin`, `identity-migrate`, the bootstrap secret
and bootstrap steps 1 to 3, the health and login checks, and `down`.

Each step that changes AWS, DNS or data needs the owner's explicit approval. The cost is about
US$0.10 an hour while the session is up. The 21:00 UTC backstop stays the last line of defence, not
the plan.
