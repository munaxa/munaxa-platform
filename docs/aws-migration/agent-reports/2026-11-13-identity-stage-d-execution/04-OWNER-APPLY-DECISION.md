# 04. Owner apply decision (decision A)

## Eligibility

**Eligible.** The real plan of `68fa6f9` matches the six declared changes exactly, with nothing undeclared, missing or destroyed beyond the declared replacements.

## What decision A would authorize

One dispatch of **AWS Terraform** on `main` with `environment=nonprod`, `action=apply`, while `main` is still `68fa6f9` (or a later commit with no infrastructure change, re-checked first). The workflow then:

1. plans again and runs `check-plan-intent.sh --enforce`, which fails the job on any difference from the six changes;
2. saves that plan (KMS-encrypted state bucket) with its SHA-256;
3. waits for **your second approval** of the `aws-nonprod` gate for the apply job;
4. applies only that saved plan, on the same commit, if it is at most 4 hours old.

Resources it changes:

| Address | Action | Effect |
| --- | --- | --- |
| `module.identity[0].aws_ecs_task_definition.this` | replace | new revision 2: 2db6ed9 api image, MFA env, refs to bundle version 80914756; revision 1 stays registered |
| `module.migrate["identity"].aws_ecs_task_definition.this` | replace | new revision: 2db6ed9 migrate image |
| `aws_ecs_task_definition.identity_bootstrap[0]` | replace | new revision: 2db6ed9 api image |
| `aws_ecs_task_definition.db_admin[0]` | replace | new revision: `IDENTITY_APP_URL` → version 80914756 |
| `aws_secretsmanager_secret.service["docs-migrate"]` | create | empty secret container, no value |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | update | docs db-admin may read the docs-migrate secret |

## What decision A does not authorize

Starting Testing (`session up`), running any task (migrate, bootstrap, db-admin), database migrations, starting the database, secret values, MFA policy, DNS or Cloudflare, IAM or network changes beyond the plan, production, or a second apply.

## Remaining risks

S-1, S-2, S-3 and B-1 are open but non-blocking (03).

**Rollback:** the old revision 1 task definitions stay registered; nothing runs. A revert PR plus a reviewed apply restores the old pins.

## Approval request

**Approve decision A: one `action=apply` dispatch of AWS Terraform on main (nonprod), applying only the six declared changes above, with your two `aws-nonprod` gate approvals?**
