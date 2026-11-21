# 01. PR #121 independent review

## PR and commits

| Field | Value |
| --- | --- |
| PR | https://github.com/munaxa/munaxa-platform/pull/121, **draft, open, not merged** |
| Head | `30de485` = merge of `main` `d4864b4` (documentation only) into `268eebe` |
| Commits | `4cd8f1a` (P-5), `3ca18ce` (review round 1), `268eebe` (stage C pin), `30de485` (main merged) |
| Files vs main | `infra/aws/stack/envs/nonprod.tfvars`, `infra/aws/stack/envs/nonprod.expected-changes.json` only |
| Update from main | main's 4 commits since the branch point are documentation only (`git diff b2d93aa origin/main -- infra scripts .github` is empty), so merging main changes no scope |

## Reviewer

A separate reviewer that had not worked on the change reviewed the code and ran its own tests offline (no AWS call, no GitHub write). **Verdict: APPROVE.**

## Configuration review

| Check | Result | Evidence |
| --- | --- | --- |
| Pin | `secret_version_ids.identity = 80914756-…`; `identity-migrate = a3cc6622-…` unchanged | nonprod.tfvars:102-103; matches 02 of the stage C execution report and today's `DescribeSecret` |
| Images | api `sha256:9a8c6ebd…3c3b`, migrate `sha256:5f3bdcce…b874`; validation requires `@sha256:<64 hex>`; no tag-only refs | nonprod.tfvars:64-65, variables.tf:180 |
| MFA | `mfa_primary_kid = mfa-nonprod-2026-11`, `mfa_policy = off` → env `MFA_ENCRYPTION_PRIMARY_KID`, `MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`; `MFA_ENCRYPTION_KEYS` is a secret **reference** to version 80914756 | nonprod.tfvars:76-79, services.tf:99-108, 132-153, data.tf:171-174, modules/service/main.tf:33 |
| Other products and prod | no change to Docs, School, Work, Control, Platform-shared, `prod.tfvars` or the prod declaration | empty diffs |
| Committed secrets | none; the only PEM is the expected public key; kid validation refuses a key-shaped kid | variables.tf:393 |

## Expected-change review (all six)

| Address | Action | Why |
| --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | replace | 2db6ed9 image, MFA env, `MFA_ENCRYPTION_KEYS` ref, all refs to 80914756 (also the Valkey sidecar's `REDIS_PASSWORD`) |
| `module.migrate["identity"].aws_ecs_task_definition.this` | replace | 2db6ed9 migrate image; its secret ref stays `a3cc6622` |
| `aws_ecs_task_definition.identity_bootstrap[0]` | replace | 2db6ed9 api image; no MFA env (bootstrap imports no config or MFA code) |
| `aws_ecs_task_definition.db_admin[0]` | replace | `IDENTITY_APP_URL` references `DATABASE_URL::<identity pin>`, so 80914756 |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | pending since platform#105; container only, no value; seen in the real 08:48 plan |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | same origin; seen in the real 08:48 plan |

- Replacements are `delete, create`; `skip_destroy` keeps old revisions registered, so rollback to revision 1 stays possible.
- Execution-role policies scope by repository and secret ARN, not digest or version, so no Identity IAM change. Identity cache and probe are off. The backstop keys on desired counts. Outputs use families only.
- Live state matches: the four families are at revision 1 with the old images (`api@sha256:71d01fdf…`, `migrate@sha256:d175ef37…`) and `ad02f18e` pins [V].

## CI and validation

See 05. All Terraform checks pass on `30de485`, locally and in CI.

## Findings

| Id | Severity | Finding | Handling |
| --- | --- | --- | --- |
| F8 | Low | `secret_version_ids` has no validation (UUID format; a non-empty `identity` pin when `identity_security_config` is set). An empty pin would fall back to `AWSCURRENT`, which is now the right version anyway | follow-up PR, not needed for stage D |
| F9 | Low | the declaration's `intent` text still describes the pre-stage-C blocker ("while … still ad02f18e") | accurate as history; optional wording fix, left unchanged to keep the reviewed declaration byte-identical |
| F12 | Low | after the merge and before the apply, the scheduled `down` session fails at "Plan the switches" (now 6 changes instead of 2); the database is still stopped by its own job and the backstop | same as S-1 today; apply soon after the merge (03) |
| F11 | Info | dispatch plan only on main, behind the `aws-nonprod` environment; plan mode uses `--report` and saves no plan; apply needs a second approval, the same commit, a plan ≤ 4 h old and a matching SHA-256 | the owner as required reviewer of `aws-nonprod` was verified by the owner on 11 Nov (G-4) [R], not re-checked here |
| F13 | Info | digest provenance (built from 2db6ed9) and the ring's contents are taken from earlier reports | the real `--enforce` plan and the first session are the final checks |

No Critical, High or Medium finding. Nothing was removed from or weakened in any expected-change assertion.
