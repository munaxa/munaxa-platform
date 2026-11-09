# Identity-only Testing preparation, Config A1: continuation

- Date: 9 Nov 2026, observations 13:41 to 13:44 UTC
- Thread: "Prepare Identity-only Testing deployment (Config A1)"
- Requested by: Tamer ("Continue Munaxa Identity-Only Testing Preparation — Config A1", 13:41 UTC)
- Builds on: [`2026-11-09-identity-config-a1-preparation/`](../2026-11-09-identity-config-a1-preparation/) (PR #69) and [`2026-11-09-pr-branch-cleanup/`](../2026-11-09-pr-branch-cleanup/) (PR #68)
- Labels: **[V]** verified, **[O]** owner action required

## Verdict

**Stopped at the owner-input stage.** The owner has not yet put the signing key and the two Identity
bundles into Secrets Manager: both secrets have **0 versions** [V, 13:42 UTC]. So the Config A1
inputs PR **has not been opened**, because it needs the owner's public key and the two version ids, and
no value is invented. Everything on the repository side is ready for it (section 6).

| Stage | Status |
| --- | --- |
| Prepared (code, declaration, guide, generator, runbook) | **Done**, merged in PR #69 (`9c7833f`) |
| Owner inputs (key, bundles, public snippet, version ids) | **Not started** [O] |
| Inputs PR | **Not opened** (waits on owner inputs) |
| Merged inputs | No |
| Real AWS plan | **Not run** |
| Applied | No |
| Verified on AWS | No |

**No AWS deployment, apply, migration, bootstrap, secret write, KMS, IAM, DNS, Cloudflare, GitHub
setting, production, Render, Supabase or CanteenHub action happened in this task.**

## 1. Starting-state verification

| Item | Observed | Source |
| --- | --- | --- |
| `munaxa-platform` `main` | `9c7833f` "infra(aws): Identity-only Config A1 preparation (no Docs task definition in A1) (#69)" | `git fetch`, 13:41 UTC [V] |
| Preparation PR #69 | **Merged** 13:35 UTC (squash, head `9683b1c`, all checks green) | GitHub [V] |
| Open PRs in `munaxa-platform` | 1: #71 "closing note for the 9 Nov branch cleanup" (the cleanup thread's; not touched) | GitHub, 13:42 UTC [V] |
| Preparation supporting files on `main` | All 6 present: generator, tfvars template, declaration draft, mocked test, addresses, image evidence | `main` tree [V] |
| Generator on `main` | sha256 `f7292ed5…8cde`, same as the guide | `sha256sum` [V] |
| Generator at the guide's pinned URL (commit `631bd49`) | Still served (HTTP 200), same sha256. The commit is not an ancestor of `main` (squash merge) but GitHub keeps it under PR #69's ref | `curl`, 13:42 UTC [V] |
| Identity release commit | `munaxa-identity` `main` = `5277d71`, same as the report | `git ls-remote` [V] |
| ECR `munaxa-identity/api` | 1 image, `sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156`, tags `5277d71`, `sha-5277d719…` | `DescribeImages`, 13:42 UTC [V] |
| ECR `munaxa-identity/migrate` | 1 image, `sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820`, same tags | `DescribeImages`, 13:42 UTC [V] |
| RDS `munaxa-nonprod-pg` | `stopped` | `DescribeDBInstances` [V] |
| ECS cluster `munaxa-nonprod` | 0 services | `ListServices` [V] |

AWS calls: 13:42:23 to 13:42:28 UTC, root connector, read-only metadata only (`DescribeSecret`,
`ListSecretVersionIds`, `DescribeRepositories`, `DescribeImages`, `DescribeDBInstances`,
`ListServices`), under `infra/aws/ACCESS-POLICY.md` D-5, D-6 and D-9 and this task's authorization of
secret-version-metadata checks. No secret value was read. No AccessDenied. The only error was
`ResourceNotFoundException` for `munaxa-nonprod/identity-bootstrap`, which is expected because it is
created only during the first session (runbook step 12).

## 2. Cleanup status

The owner ran the cleanup. Remote branches at 13:41 UTC (`git ls-remote --heads`) [V]:

| Repository | Branches | Besides `main` |
| --- | ---: | --- |
| munaxa | 1 | none |
| munaxa-platform | 2 | `claude/project-thread-glr7yg` (cleanup thread, PR #71 open) |
| munaxa-identity | 1 | none |
| munaxa-control | 1 | none |
| munaxa-work | 1 | none |
| munaxa-docs | 2 | `claude/zealous-cori-v2b9l4` (one of the 7 kept; marketing media) |
| munaxa-school | 1 | none |

So the 196 listed deletions are done, and 6 of the 7 branches kept for an owner decision are also gone
(the owner's decision; their commits are not on `main`). The cleanup script was not rerun and no
branch was deleted by this task.

## 3. Preparation PR merge status

PR #69 merged as `9c7833f` at 13:35 UTC. On `main` now:

- `infra/aws/stack/docs.tf`: `aws_ecs_task_definition.docs_db_admin` has
  `count = local.docs_defined && var.postgres_image != "" ? 1 : 0`, so A1 registers no Docs task definition.
- `infra/aws/stack/tests/stack.tftest.hcl`: run
  `identity_only_config_a1_registers_identity_and_nothing_of_another_product` asserts this.

This fix is preserved. The inputs PR will not touch `docs.tf`.

## 4. Owner-input status (no secret values)

| Secret | ARN suffix | KMS key | Versions | Last changed |
| --- | --- | --- | ---: | --- |
| `munaxa-nonprod/identity` | `-sn5umm` | `45eda044…` (`alias/munaxa-nonprod-data`) | **0** | 5 Nov 22:46 UTC (container created in G3) |
| `munaxa-nonprod/identity-migrate` | `-tv3PAq` | `45eda044…` | **0** | 5 Nov 22:46 UTC |
| `munaxa-nonprod/identity-bootstrap` | does not exist (expected) | | | |

Guide parts A and B have **not** been done. Nothing public (key snippet, version ids) has been supplied in
the thread.

## 5. Next owner action [O]

The exact steps are in the committed guide, [`01-OWNER-INPUT-GUIDE.md`](../2026-11-09-identity-config-a1-preparation/01-OWNER-INPUT-GUIDE.md)
parts A and B. Summary, in order:

1. **A.0**: Node.js 18+; Windows clipboard history **off**; database host
   `munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com`.
2. **A.1**: download the generator from the pinned URL and check that its SHA256 is
   `F7292ED5E8E0FFB396463688AFA116D7C2A68E70D701929F35FEC0439BA68CDE` (verified still correct today).
3. **A.2**: `$v = node .\identity-a1-owner-values.mjs --kid identity-nonprod-2026-11 --db-host $dbHost --public-out .\public | ConvertFrom-Json`
   (13 `ok` lines, the key id and the public key only).
4. **A.3 / A.4**: `Set-Clipboard -Value $v.identity` and paste it into `munaxa-nonprod/identity`
   (Plaintext, Save). Then `Set-Clipboard -Value $v.identityMigrate` into `munaxa-nonprod/identity-migrate`.
5. **A.5**: `Set-Clipboard -Value ' '`; `Remove-Variable v`; close the window.
6. **B**: post in the thread **only**:
   - the two lines of `.\public\identity-a1.auto.tfvars.snippet` (key id and public key);
   - the two `AWSCURRENT` version ids (or let Claude read them with `ListSecretVersionIds`, metadata only).

Never post the private key, a password, the signing secret or bundle JSON in the thread.

## 6. Inputs PR: what it will contain (not opened yet)

Opened from the latest `main` as soon as step B is done. It changes only two files:

1. `infra/aws/stack/envs/nonprod.tfvars`, with these additions and changes from
   `supporting/nonprod.config-a1.tfvars.TEMPLATE`:
   - `images.identity_api` and `images.identity_migrate` at the digests in section 1;
   - `valkey_image = "public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e"`;
   - `postgres_image = "public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e"`;
   - `db_bootstrap_products = ["identity"]`;
   - `identity_signing_kid = "identity-nonprod-2026-11"`;
   - `identity_public_keys` = the owner's public line, verbatim;
   - `secret_version_ids = { identity = "<owner id>", identity-migrate = "<owner id>" }`;
   - `desired_counts`: `identity = 1`, and `0` for each of `control-api`, `control-portal`, `work-api`,
     `work-admin`, `school-api`, `school-admin`, `docs-api`, `docs-web`, `docs-scanner`. These are the same
     10 keys as the current `nonprod.tfvars`, so nothing is left at a default of 1.
2. `infra/aws/stack/envs/nonprod.expected-changes.json` = the 22-address declaration (section 7),
   replacing the backstop declaration that is already applied.

It adds no Control, Work, School or Docs image and no secret value. `services_enabled` stays `false`.

## 7. Exact expected resource declaration (22 creates)

Source: `supporting/nonprod.expected-changes.config-a1.DRAFT.json`, root `stack-nonprod`, all `create`.

1. `aws_ecs_task_definition.db_admin[0]`
2. `aws_ecs_task_definition.identity_bootstrap[0]`
3. `aws_iam_role.identity_bootstrap_execution[0]`
4. `aws_iam_role_policy.identity_bootstrap_execution[0]`
5. `aws_vpc_security_group_egress_rule.alb_to_service["identity"]`
6. `module.identity[0].aws_cloudwatch_log_group.this`
7. `module.identity[0].aws_ecs_task_definition.this`
8. `module.identity[0].aws_iam_role.execution`
9. `module.identity[0].aws_iam_role_policy.execution`
10. `module.identity[0].aws_security_group.this`
11. `module.identity[0].aws_vpc_security_group_egress_rule.database[0]`
12. `module.identity[0].aws_vpc_security_group_egress_rule.https`
13. `module.identity[0].aws_vpc_security_group_ingress_rule.database_from_service[0]`
14. `module.identity[0].aws_vpc_security_group_ingress_rule.from_alb[0]`
15. `module.migrate["identity"].aws_cloudwatch_log_group.this`
16. `module.migrate["identity"].aws_ecs_task_definition.this`
17. `module.migrate["identity"].aws_iam_role.execution`
18. `module.migrate["identity"].aws_iam_role_policy.execution`
19. `module.migrate["identity"].aws_security_group.this`
20. `module.migrate["identity"].aws_vpc_security_group_egress_rule.database[0]`
21. `module.migrate["identity"].aws_vpc_security_group_egress_rule.https`
22. `module.migrate["identity"].aws_vpc_security_group_ingress_rule.database_from_service[0]`

Not in it: `aws_ecs_task_definition.docs_db_admin[0]`.

## 8. Terraform and mocked test results (on `main` `9c7833f`, local, no AWS)

Terraform 1.16.5 and AWS provider 6.67.0 from the local mirror.

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive` (stack) | pass |
| `terraform validate` | "Success! The configuration is valid." |
| `terraform test` (stack, CI suite) | **26 passed, 0 failed** |
| A1 mocked test (`supporting/config-a1-mocked.tftest.hcl`, `-var-file=envs/nonprod.tfvars`) | **4 passed**. Services off after the applied mocked baseline: **22 to add, 0 to change, 0 to destroy**. Session up: 11 to add, 0 to change, 0 to destroy |
| Mocked plan addresses vs declaration | **identical** (sorted `diff` of the 22 plan addresses and the 22 declared addresses: no difference) |
| `docs_db_admin` in the mocked plan | absent (0 matches) |
| `check-plan-intent.sh --validate` on the declaration | "Declaration valid: root stack-nonprod, 22 declared change(s)." |
| Desired-count map | template covers all 10 keys of the current `nonprod.tfvars`; only `identity = 1` |

The mocked test uses the test public key and placeholder version ids. It is **not** an AWS plan and
proves nothing about AWS permissions. These checks will be repeated on the inputs PR with the owner's
real values.

## 9. Real AWS plan, after the inputs PR is merged (owner-dispatched)

Not dispatched by Claude. When the owner has merged the inputs PR:

1. GitHub, `munaxa/munaxa-platform`, **Actions**, workflow **`aws-terraform.yml`**, **Run workflow**.
2. Branch `main`; environment **`nonprod`**; action **`plan`**. Run.
3. Post the run link in the thread. Claude compares the plan with section 7.

Expected: **22 to add, 0 to change, 0 to destroy**, exactly the 22 addresses. **Stop** (no apply) if
the plan shows any of these: a change to the database, VPC, subnet, route, security group outside the
22, or ACM; any backstop or scheduler change; any production resource; any Control, Work, School or
Docs resource; any IAM change outside items 3, 4, 8, 9, 17 and 18; any address outside the 22; any
destroy or replacement; any update. The declaration is not edited to make a plan pass. The apply is a
separate owner approval (runbook step 7).

Between the inputs merge and the apply, the scheduled `aws-session` runs fail safely at their plan
check (runbook note after step 7). The plan and the apply should be done in
one sitting.

## 10. Remaining blockers

| # | Blocker | Owner |
| --- | --- | --- |
| B-2 | Guide A and B: key and bundles in Secrets Manager; public snippet and version ids in the thread | **Owner** |
| B-3 | Inputs PR opened, checks green, merged | Claude opens, owner merges |
| B-5 | Real `nonprod` plan reviewed against section 7 | Owner dispatches, Claude and owner review |

B-1 (AWS re-check) and B-4 (merge #69) are closed.
