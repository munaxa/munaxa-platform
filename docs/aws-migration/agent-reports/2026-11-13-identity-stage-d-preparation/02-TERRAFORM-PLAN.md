# 02. Terraform plan readiness

## Result

**No real plan of the reviewed configuration was generated.** The only approved plan path is the `AWS Terraform` workflow, and its plan job runs only for a dispatch on `main`:

```yaml
plan:
  if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'
  environment: aws-${{ inputs.environment }}
```

PR #121 is not on `main`, so a dispatch now would plan `main`'s configuration (old images, `ad02f18e` pins), not the reviewed one. Changing the workflow, planning locally with copied credentials, or any other route would bypass the reviewed control, and CLAUDE.md forbids copying credentials. So the real plan waits for decision M (merge).

## Identification and safety checks (done; they hold for the post-merge run)

| Check | Result |
| --- | --- |
| Root module | `infra/aws/stack` |
| Workspace | default (none set) |
| Backend | S3 `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate`, KMS `alias/munaxa-shared-tfstate` (`envs/nonprod.backend.hcl`) |
| Variables | `-var-file=envs/nonprod.tfvars`; `TF_VAR_deployer_role_arn` from repository variables |
| Workflow | `.github/workflows/aws-terraform.yml`, dispatch `environment=nonprod`, `action=plan` |
| Account, region | `allowed-account-ids: 229251310592`, `AWS_REGION: eu-central-1`; the deployer role is the account's nonprod deployer |
| Cannot target prod | `environment=nonprod` selects `nonprod.tfvars`, `nonprod.backend.hcl` and the `aws-nonprod` environment; prod is a different input, file set and environment |
| Management account | 229251310592 is both the workload account and the Organizations management account (accepted on 8 Nov; access policy); the plan touches only stack resources in it |
| Plan-only | `action=plan` gives `--report`, does not save the plan, and the apply job's condition (`inputs.action == 'apply'`) is false |
| Side effects of planning | none: no service start, deployment, migration or secret write. The stack has no secret-value data source; the one ephemeral read (Identity cache AUTH token) is off in nonprod (`identity_cache` false) |
| Pinned version | after the merge, `main` carries `secret_version_ids.identity = 80914756-…` |

## Real-state baseline (latest real plan)

Scheduled "AWS Testing session" run 43396042072, job "Testing down", 08:48 UTC today, main `b2d93aa` (infrastructure identical to today's `main`), switches off:

```
Plan: 1 to add, 1 to change, 0 to replace, 0 to destroy.
| update | aws_iam_role_policy.docs_db_admin_execution[0] |
| create | aws_secretsmanager_secret.service["docs-migrate"] |
```

## Expected versus predicted post-merge plan

| Address | Declared | Predicted | Basis |
| --- | --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | delete, create | delete, create | mocked render; live revision 1 differs |
| `module.migrate["identity"].aws_ecs_task_definition.this` | delete, create | delete, create | image digest change |
| `aws_ecs_task_definition.identity_bootstrap[0]` | delete, create | delete, create | image digest change |
| `aws_ecs_task_definition.db_admin[0]` | delete, create | delete, create | `IDENTITY_APP_URL` pin |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | create | real 08:48 plan |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | update | real 08:48 plan |

Nothing else is predicted: no database, network, security group, IAM task role, schedule, backstop, ALB or ECS service change (01; reviewer F4).

## Plan-intent results

- `--validate`: nonprod valid, 6 changes; prod valid, 0 [V].
- `--enforce` on **synthetic** plan JSON (supporting file): the six declared changes pass (exit 0); a plan without the db-admin replacement, a plan with an extra secret version, and a db-admin no-op are all refused (exit 1) [V].
- `--enforce` on the **real** plan: [U] until after the merge. A plan dispatch runs the same comparison in `--report` mode and prints either "matches the declared changes exactly" or the differences; an apply dispatch runs it as `--enforce` and stops before saving the plan if it does not match.

## Unavailable evidence

- The real plan of `30de485`'s configuration and its `--enforce` result.
- Whether the `aws-nonprod` environment still requires the owner (owner-verified 11 Nov).
