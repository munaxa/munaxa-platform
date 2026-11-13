# 06. Expected Terraform changes

**THIS IS NOT A REAL PLAN.** No plan was run against AWS, no state was read, no backend was used. The real plan is stage D (owner-approved `aws-terraform.yml` dispatch).

Legend: **[W]** seen in a real plan run by a workflow, **[L]** offline or mocked local result, **[V]** code reading, **[E]** expectation.

## Method [L]

1. Offline, empty-state plans of `main` (`b2d93aa`) and the P-5 branch with `-var-file=envs/nonprod.tfvars`, through `2026-11-12-phase-c-d-preparation/supporting/tools/offline-plan.sh`: local backend, fake keys, every outbound connection refused, no AWS credentials, `-refresh=false`. Both: 100 to add (102 addresses). `plan-diff.mjs`: no address added or removed, no known planned value differs (`supporting/offline-plan-diff-b2d93aa-vs-p5.txt`). Container definitions are unknown in such a plan (they embed ARNs), so:
2. A mocked `terraform test` rendered the container definitions at both commits with the same ARN overrides (`supporting/rendered-task-definition-diff-b2d93aa-vs-p5.txt`).
3. Only `.tfvars` changed, so no configuration expression differs.

## Baseline: the real state equals main plus the docs-migrate delta [W]

Scheduled run 43396042072 (13 Nov 08:48 UTC) planned exactly `+ aws_secretsmanager_secret.service["docs-migrate"]` and `~ aws_iam_role_policy.docs_db_admin_execution[0]` on main (01).

## Expected stage D plan, after stage C (the declaration in PR #121)

| Address | Action | Why | Basis |
| --- | --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | replace (`delete`, `create`) | image `9a8c6ebd…`; env `MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11`, `MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`; secret `MFA_ENCRYPTION_KEYS`; every bundle reference at the new version | [L] render |
| `module.migrate["identity"].aws_ecs_task_definition.this` | replace | image `5f3bdcce…` | [L] render |
| `aws_ecs_task_definition.identity_bootstrap[0]` | replace | image `9a8c6ebd…` (runs `scripts/bootstrap-account.mjs`, which does not load Identity's configuration, so it needs no MFA input) | [L] render, [V] |
| `aws_ecs_task_definition.db_admin[0]` | replace | `IDENTITY_APP_URL` reference carries `secret_version_ids.identity` (`ops.tf:138-141`); found by the independent review | [V] |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | pending L-5 delta (a container, no value) | [W] |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | pending L-5 delta | [W] |

Terraform's summary is expected to read **5 to add, 1 to change, 4 to destroy** [E]. The four "destroys" are task-definition revisions with `skip_destroy = true`: dropped from state, not deregistered, kept as rollback targets [V].

**Not expected (no change):** Identity execution-role policies (scoped to the bundle ARN and the ECR repository, not to JSON keys or versions) [V]; `identity_probe` (no probe commit) [V]; any ECS service, ALB, target group, network, RDS, KMS, ACM, backstop, cache, SNS, alarm or production address [L].

## The merge blocker is enforced at apply time [L]

The declaration describes the post-stage-C plan. If PR #121 were merged and applied with the old pin `ad02f18e`, the db-admin replacement would be missing from the real plan and `check-plan-intent.sh --enforce` refuses it. Tested with synthetic plan JSONs: 6 changes, "The plan matches the declared changes exactly"; without db-admin, "Declared but not in the plan … Nothing may be applied".

## Stop conditions for stage D (runbook 03 §5, read with this declaration)

Any destroy other than the four task-definition replacements; any IAM change other than `docs_db_admin_execution`; any `elasticache`, `sns` or `cloudwatch_metric_alarm`; any RDS, VPC, subnet, route, ACM, backstop or production address.
