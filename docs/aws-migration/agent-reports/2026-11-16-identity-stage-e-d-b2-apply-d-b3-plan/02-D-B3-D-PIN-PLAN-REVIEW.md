# 02. D-B3/D-PIN nonprod plan (plan only, not applied)

## 1. Inputs checked before the plan

| Check | Result |
| --- | --- |
| D-B2 applied and verified | Yes (file 01). The nonprod deployer now holds the cleanup policy, which this plan needs. |
| `main` | `19fa5bc`. It contains #131 `ac0ae60`, #132 `3ea00f9`, #129 `9752146` and #134 `19fa5bc`. Since #132, the only commits are documentation. |
| Account, region, backend | Workflow env `AWS_ACCOUNT_ID=229251310592`, `AWS_REGION=eu-central-1`. Backend `envs/nonprod.backend.hcl`: bucket `munaxa-shared-tfstate-229251310592`, key `nonprod/stack.tfstate`, KMS alias `munaxa-shared-tfstate`. |
| Cleanup configuration | `envs/nonprod.tfvars:111` `session_cleanup_enabled = true` |
| Probe pin (D-PIN) | `identity_probe_source` in `envs/nonprod.tfvars`, as merged in #132. It pins commit `2f6d443` and probe SHA-256 `7254a0ba…e369`. |
| Bootstrap flag | Every later bootstrap plan and apply must pass `-var testing_session_cleanup=true`. Recorded in the D-B2 report (file 05 §3) and project memory. The stack plan does not use it. |
| Last stack apply | Stage D, run 43513076111 at `68fa6f9`, 13 Nov. The stack changes since then are #130, #131 and #132 (session-cleanup, identity-probe, ops and backstop). |

## 2. The plan

- **Run:** [43868859420](https://github.com/munaxa/munaxa-platform/actions/runs/43868859420), `aws-terraform.yml`, `workflow_dispatch`, environment `nonprod`, action `plan`, commit `19fa5bc`.
- **Timing:** dispatched by Claude on 16 Nov at 12:41 UTC. The owner approved the `aws-nonprod` environment for the plan job, and it ran on 18 Nov from about 08:14 to 08:15:12 UTC. Conclusion: success.
- **Credentials:** CI role through OIDC, then deployer `munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod`, session `gha-run-43868859420`.
- **Printed output:** in plan mode the workflow prints only addresses, actions and the names of attributes that change. It never prints values, so no secret value can reach the log. The saved plan is not kept, and the workflow has no apply job in plan mode.

```
Plan: 9 to add, 2 to change, 1 to replace, 0 to destroy.
```

| # | Action | Address | Declared |
| --- | --- | --- | --- |
| 1 | create | `aws_cloudwatch_metric_alarm.session_cleanup_failed[0]` | create |
| 2 | create | `aws_cloudwatch_metric_alarm.session_cleanup_not_run[0]` | create |
| 3 | replace | `aws_ecs_task_definition.identity_bootstrap[0]` | delete, create (L-A0) |
| 4 | create | `aws_ecs_task_definition.identity_probe[0]` | create (D-PIN) |
| 5 | create | `aws_iam_role.session_cleanup[0]` | create |
| 6 | update | `aws_iam_role_policy.identity_bootstrap_execution[0]` | update (L-A0) |
| 7 | update | `aws_iam_role_policy.session_backstop[0]` | update |
| 8 | create | `aws_iam_role_policy.session_cleanup[0]` | create |
| 9 | create | `aws_scheduler_schedule.session_cleanup_daily[0]` | create |
| 10 | create | `aws_sfn_state_machine.session_cleanup[0]` | create |
| 11 | create | `aws_sns_topic.session_cleanup_alerts[0]` | create |
| 12 | create | `aws_sns_topic_policy.session_cleanup_alerts[0]` | create |

The intent checker ran in `--report` mode against `envs/nonprod.expected-changes.json` and printed:

> The plan matches the declared changes exactly (12 resource action(s)).

The declared changes split as follows: D-B3 has 8 creates (rows 1, 2, 5, 8 to 12) and 1 update (row 7), D-PIN has 1 create (row 4), and L-A0 has 1 replacement and 1 update (rows 3 and 6).

Changed attributes:

| Address | Attributes that change | Forces replacement |
| --- | --- | --- |
| `aws_ecs_task_definition.identity_bootstrap[0]` | `arn`, `arn_without_revision`, `container_definitions`, `enable_fault_injection`, `id`, `ipc_mode`, `pid_mode`, `revision`, `tags`, `task_role_arn` | `container_definitions` |
| `aws_iam_role_policy.identity_bootstrap_execution[0]` | `policy` | |
| `aws_iam_role_policy.session_backstop[0]` | `policy` | |

The identity-bootstrap task definition replacement creates a new revision. `skip_destroy` keeps the old one, and the plan has 0 to destroy. The other changed attributes are computed or defaulted fields of the new revision.

## 3. Safety checks on the plan

| Must not contain | Finding |
| --- | --- |
| Production resources | None. Every address is in the nonprod stack (`stack-nonprod`), and the declaration names no prod resource. |
| Unexpected deletes or replacements | 0 destroy. The one replacement is declared (L-A0), and `skip_destroy` keeps the old revision. |
| Unapproved changes | None. The checker found an exact 12 of 12 match, with no extra address. |
| Secret values | None printed. The workflow redacts values by design. No secret resource is created or changed. The new task definition references the secret `munaxa-nonprod/identity-operator` by ARN only. That secret does not exist yet and is created later by C-8G, which is not authorized. |
| Unexpected IAM permissions | None beyond the reviewed code. Details below. |

The IAM changes were checked against the source at `19fa5bc`, which the 14 to 15 Nov reviews of #130 and #131 already covered:

- `session_backstop` gains `StartTheSessionCleanup`: `states:StartExecution` on the one cleanup state machine (`backstop.tf:90`).
- `identity_bootstrap_execution` reads `identity-migrate` plus `munaxa-nonprod/identity-operator-??????` instead of the retired one-run copy (`ops.tf:231-237`). The secret's own resource policy also limits the read to the C-8G window.
- The new `session_cleanup` role policy (`session-cleanup.tf`) holds these grants:
  - `DeleteSecret` only on `identity-bootstrap-??????`;
  - explicit denies on any other secret, on any secret value, and on production;
  - delete of the nonprod ALB only;
  - scale-in of nonprod ECS services only;
  - stop of tasks in the nonprod cluster only;
  - stop of the `munaxa-nonprod-pg` database only.

**Result: D-B3/D-PIN PLAN READY FOR OWNER REVIEW.**

## 4. How the apply would run (needs a separate owner approval)

1. Dispatch `aws-terraform.yml` on `main` with environment `nonprod` and action **apply**.
2. The plan job re-plans and enforces the declaration (`--enforce`), so any deviation from the 12 changes fails.
3. The saved plan is kept in the state bucket.
4. The apply job waits for a second `aws-nonprod` approval, then applies that saved plan only. It requires the same commit and a plan less than 4 hours old.
5. Afterwards, a fresh plan must show no changes.

Run 43868859420 itself cannot be applied: it was a report-only plan.
