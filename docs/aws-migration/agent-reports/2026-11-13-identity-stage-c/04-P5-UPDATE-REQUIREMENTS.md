# 04. P-5 (PR #121): the change after stage C

PR: https://github.com/munaxa/munaxa-platform/pull/121. It is a **draft** and stays one. **Not changed and not merged by this task.** Its head is still `3ca18ce` (branch `claude/project-thread-xdgua1`), and its CI was green at that head (previous report 05).

## 1. What is already in the PR and must stay exactly as it is

| Item | Value |
| --- | --- |
| API image | `…/munaxa-identity/api@sha256:9a8c6ebdc9a5ff33f07bb56760e3856f5a7819550b737db72bba4b0d794b3c3b` |
| Migrate image | `…/munaxa-identity/migrate@sha256:5f3bdcce0bef560da5c9843a9be583e3c53508b0e8d11754213eb6df8734b874` |
| `identity_security_config` | `{ mfa_primary_kid = "mfa-nonprod-2026-11", mfa_policy = "off" }` |
| `secret_version_ids.identity-migrate` | `a3cc6622-df66-4787-bae7-83ccfec56ff4` (the migrate image reads only `DATABASE_MIGRATION_URL`) |
| `envs/nonprod.expected-changes.json` | the six declared post-stage-C changes (below). No edit needed |

## 2. The exact minimal change (only after the owner sends the id)

`<NEW_VERSION_ID>` is the `new_version_id` line from the owner's CloudShell output. **No id is invented or assumed.** Claude does not touch the PR until that line arrives in the thread.

```diff
-# Bundle version pins (metadata, not secrets): the AWSCURRENT version id of each bundle, supplied by
-# the owner on 10 Nov 2026.
+# Bundle version pins (metadata, not secrets). identity-migrate: supplied by the owner on 10 Nov 2026.
-# MERGE BLOCKER (P-5): identity must be replaced by the version id that stage C creates (the bundle
-# version holding MFA_ENCRYPTION_KEYS), read with describe-secret / list-secret-version-ids, never
-# get-secret-value. ad02f18e holds no MFA_ENCRYPTION_KEYS, and ECS refuses to start a task whose
-# secret names a JSON key its pinned version lacks. identity-migrate is unchanged: the migrate image
-# reads only DATABASE_MIGRATION_URL. envs/nonprod.expected-changes.json is declared for the new version
-# (it also replaces db-admin, whose IDENTITY_APP_URL carries this pin), so with ad02f18e still here the
-# real plan does not match the declaration and check-plan-intent.sh --enforce refuses the apply.
+# identity: the stage C version (report 2026-11-13-identity-stage-c), which adds MFA_ENCRYPTION_KEYS
+# (kid mfa-nonprod-2026-11) to the five earlier values; ad02f18e is its AWSPREVIOUS. Supplied by the
+# owner from the stage C output and checked with describe-secret metadata only. db-admin is replaced
+# with it (its IDENTITY_APP_URL carries this pin), as envs/nonprod.expected-changes.json declares.
 secret_version_ids = {
-  identity         = "ad02f18e-f3e7-41da-9959-f9b41e0b7e1a"
+  identity         = "<NEW_VERSION_ID>"
   identity-migrate = "a3cc6622-df66-4787-bae7-83ccfec56ff4"
 }
```

Nothing else changes in the tfvars file, the declaration, any module or any other environment. `prod.tfvars` stays untouched.

## 3. Checks before the update is pushed

1. **The id is real (read-only metadata, a later task).** `DescribeSecret munaxa-nonprod/identity` must show `VersionIdsToStages = { <NEW_VERSION_ID>: [AWSCURRENT], ad02f18e-…: [AWSPREVIOUS] }`, with the creation time of the owner's run. This uses the AWS connector, metadata only, never `GetSecretValue`. It needs the owner's go-ahead for that read, since this task allows no AWS call.
2. **The format.** The id is a version id of 32 to 64 characters. The script makes a UUID v4, so the check is `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. A 43-character token, which could be a pasted key, is refused.
3. **Offline only:** `terraform fmt -check`, `terraform validate`, the stack's `terraform test` suites, and `check-plan-intent.sh --validate`. Also the mocked render: it must show the new id in all six Identity secret references, the Valkey `REDIS_PASSWORD` reference and db-admin's `IDENTITY_APP_URL`, and nothing else changed.
4. CI green on the new head. Then the PR leaves draft for review. Merging stays under the owner's rules, and stage D (plan and apply) is a separate owner approval.

## 4. Evidence that the declared changes stay correct

**Mocked render** (`supporting/p5-placeholder-render-diff.txt`, `terraform test` with the mock provider and no AWS). The PR head is rendered twice: as is, and with only `secret_version_ids.identity` set to the placeholder `00000000-0000-4000-8000-00000000c0de`. The placeholder is never committed.

| Task definition | Changes when the pin changes | Declared change |
| --- | --- | --- |
| `module.identity[0]` (api) | all 6 secret references and the Valkey sidecar's `REDIS_PASSWORD` move to the new id; environment unchanged (`MFA_ENCRYPTION_PRIMARY_KID=mfa-nonprod-2026-11`, `MFA_POLICY=off`, `IDENTITY_PASSWORD_RESET=disabled`, `NODE_ENV=production`) | replace (it is also replaced for the 2db6ed9 image) |
| `aws_ecs_task_definition.db_admin[0]` | `IDENTITY_APP_URL` moves to the new id; nothing else | **replace, only because of the pin** |
| `module.migrate["identity"]` | nothing (pins `a3cc6622`) | replace (for the 2db6ed9 migrate image) |
| `aws_ecs_task_definition.identity_bootstrap[0]` | nothing (pins `a3cc6622`; the one-run secret is unpinned) | replace (for the 2db6ed9 api image) |

So the declaration holds after the update:

- four replacements: identity, identity-migrate, identity-bootstrap, db-admin;
- `+ aws_secretsmanager_secret.service["docs-migrate"]`;
- `~ aws_iam_role_policy.docs_db_admin_execution[0]`.

The expected summary stays **5 to add, 1 to change, 4 to destroy** (previous report 06). The "destroy" is the replacement half; `skip_destroy` keeps the old revisions registered.

**Plan-intent enforcement re-run on the PR head** (`supporting/check-plan-intent-enforce-pr121-3ca18ce.txt`, the repository's own `scripts/terraform/check-plan-intent.sh --enforce`, synthetic plans):

| Synthetic plan | Result |
| --- | --- |
| the six declared changes | accepted, exit 0 |
| db-admin replacement missing (the stale-pin plan) | **refused**, exit 1: "Declared but not in the plan: aws_ecs_task_definition.db_admin[0] delete,create" |
| db-admin present as `no-op` | **refused**, exit 1 |
| one extra undeclared change | **refused**, exit 1 |
| `--validate` on the declaration | valid, 6 declared changes |

The declaration is an exact two-way match. So a real plan that omits the db-admin replacement, which is what happens while the pin is still `ad02f18e`, is refused at apply. That enforcement stays after the update. **The db-admin entry must never be removed to make a plan pass.**

## 5. If stage C does not finish

| Case | P-5 |
| --- | --- |
| The script stops with `NOTHING WRITTEN` | no change; PR #121 stays draft with the blocker |
| `AFTER_WRITE_ATTEMPT` | no change until the labels are checked read-only and the outcome is clear |
| An undo (labels only, before stage D) | no PR change. The script refuses to run again in that state (`UNEXPECTED_VERSIONS`), so repeating stage C needs a revised, reviewed script. The PR only ever takes a version that metadata shows as `AWSCURRENT`, with `ad02f18e` as `AWSPREVIOUS` |
