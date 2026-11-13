# 02. Real Terraform plan (decision P)

## Run

| Field | Value |
| --- | --- |
| Workflow | AWS Terraform (`.github/workflows/aws-terraform.yml`) |
| Run | [43509702203](https://github.com/munaxa/munaxa-platform/actions/runs/43509702203), run number 196, `workflow_dispatch` |
| Inputs | `environment=nonprod`, `action=plan`; ref `main` |
| Commit | `68fa6f93fd55c2480f3a8e6e486b5957539eaafa` |
| Dispatched | 21:19:47 UTC; waited at the `aws-nonprod` environment gate; owner approved; job ran 21:29:02–21:29:40 |
| Jobs | "Plan nonprod (plan)": success. "Apply … (the saved plan only)": **skipped**. Static checks: skipped (dispatch) |
| Dispatches | exactly one |

## Pre-dispatch verification [V]

| Check | Result |
| --- | --- |
| Merge commit on main | `68fa6f9` |
| Reviewed values on main | tree equals `30de485` |
| Root, variables, backend | `working-directory: infra/aws/stack`; `-var-file=envs/nonprod.tfvars`; `-backend-config=envs/nonprod.backend.hcl` (key `nonprod/stack.tfstate`) |
| Account and region | `allowed-account-ids: 229251310592`, `aws-region: eu-central-1`; the log shows the deployer `…:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod` |
| Plan only | `action=plan` → `MODE: --report` (log); "Keep the saved plan" skipped; apply job condition false (skipped) |
| No side effects | plan only reads; no secret-value data source; the ephemeral cache token read is off in nonprod |

## Actual plan (addresses and attribute names only; the public log never prints values)

```
Plan: 1 to add, 1 to change, 4 to replace, 0 to destroy.

| replace | aws_ecs_task_definition.db_admin[0] |
| replace | aws_ecs_task_definition.identity_bootstrap[0] |
| update  | aws_iam_role_policy.docs_db_admin_execution[0] |
| create  | aws_secretsmanager_secret.service["docs-migrate"] |
| replace | module.identity[0].aws_ecs_task_definition.this |
| replace | module.migrate["identity"].aws_ecs_task_definition.this |
```

| Address | Attributes that change | Forces replacement |
| --- | --- | --- |
| `aws_ecs_task_definition.db_admin[0]` | arn, arn_without_revision, container_definitions, enable_fault_injection, id, ipc_mode, pid_mode, revision, tags, task_role_arn | container_definitions |
| `aws_ecs_task_definition.identity_bootstrap[0]` | same list | container_definitions |
| `module.identity[0].aws_ecs_task_definition.this` | same list | container_definitions |
| `module.migrate["identity"].aws_ecs_task_definition.this` | same list | container_definitions |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | policy | — |

**About the extra attribute names.** `plan-changed-attributes.sh` lists any top-level attribute whose planned value differs or is unknown, including a change from an empty value to null.
- `arn`, `arn_without_revision`, `id` and `revision` are new on any replacement.
- The live revision 1 of all four families has no task role, no IPC or PID mode and no fault injection (`DescribeTaskDefinition`, 21:3x UTC). The code sets `task_role_arn = null` when no task policy exists (modules/service/main.tf:221) and sets none of the other three.
- Resource `tags` are null in code; the four default tags come from the provider (`tags_all`).

So these names are empty-to-null differences, not new values. Only `container_definitions` forces the replacement, as declared [V].

## Comparison with the declaration

| Address | Declared | Actual | Match |
| --- | --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | delete, create | replace | yes |
| `module.migrate["identity"].aws_ecs_task_definition.this` | delete, create | replace | yes |
| `aws_ecs_task_definition.identity_bootstrap[0]` | delete, create | replace | yes |
| `aws_ecs_task_definition.db_admin[0]` | delete, create | replace | yes |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | create | yes |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | update | yes |

**Workflow intent check:** `The plan matches the declared changes exactly (6 resource action(s)).`

- In plan mode the workflow runs `check-plan-intent.sh --report`. That is the same exact set comparison as `--enforce`: addresses and action lists, both directions. `--report` only prints the result instead of failing.
- `--enforce` itself runs in the apply dispatch's plan job before the plan is saved, and it fails the job on any difference.

## Review focus

| Area | Finding |
| --- | --- |
| Secret version references, image digests, MFA env, db-admin `IDENTITY_APP_URL` | carried inside `container_definitions`. Their values are not in public logs; the reviewed mocked render and the reviewer's plan test show exactly the pins, digests and MFA env (stage D preparation 01, 05) |
| Database, network, security groups, IAM roles, ECS services, ALB, DNS, schedules | no resource change |
| Destroy or unexpected replacement | none; only the 4 declared replacements |
| Undeclared or missing action | none |

## Unavailable evidence

The attribute values of the plan are not printed in the public log by design. The saved plan is not kept in plan mode, so there is no plan file or checksum for this run.
