# 05. Terraform plan expectations (Phases D1 and D4)

Tags: **[V]** verified fact, **[L]** local test result, **[E]** estimate, **[R]** recommendation,
**[U]** unverified assumption, **[O]** owner authorization required, **[V-doc]** stated in AWS or Terraform documentation, not observed.

**No real plan was run.** No state was read, no backend was used, no AWS call was made, and no secret was read.

## D1. The merged design, checked locally

**[L]** Terraform 1.16.5 and hashicorp/aws 6.67.0 (both downloaded from releases.hashicorp.com and checked against their SHA256SUMS). All runs were offline, with the environment's AWS credentials unset.

| Check | main `47ffd08` | platform#114 head |
| --- | --- | --- |
| `terraform fmt -check -recursive infra/aws` | pass | pass |
| `validate` bootstrap, stack | pass | pass |
| `test` bootstrap | 12/12 | 12/12 |
| `test` stack (mocked) | 66/66 | 67/67 |
| `test` modules/service (mocked) | 14/14 | 17/17 |

Each requirement, with its evidence:

| Requirement | Evidence (test in `infra/aws`) |
| --- | --- |
| Testing uses one Identity task | `testing_sidecar_with_two_tasks_is_refused`; module `a_per_task_store_with_two_tasks_is_refused`; `nonprod.tfvars` `desired_counts.identity = 1` **[V]** |
| One Valkey sidecar | `testing_identity_deploys_one_task_at_zero_and_one_hundred_percent` (containers `identity`, `valkey`); rendered task definition holds exactly these two **[L]** |
| Sidecar has no exposed port | `testing_sidecar_is_reachable_only_inside_its_task`; module `a_sidecar_with_a_port_mapping_is_refused`; binds 127.0.0.1 **[V]** |
| Production Identity cannot use the sidecar | `production_never_registers_a_sidecar_even_with_services_off`; `production_with_both_stores_is_refused` |
| Production Identity requires the shared cache | `production_identity_without_the_shared_cache_is_refused` |
| Cache restricted to the Identity service SG | `production_identity_service_alone_carries_the_cache_client_group` (probe, bootstrap and db-admin do not) |
| Private database subnets | `production_cache_is_private_encrypted_authenticated_and_never_evicts` (subnet group over `aws_subnet.db`) |
| TLS required | same test, plus postcondition: `transit_encryption_mode = "required"` |
| AUTH token write-only | `auth_token_wo` only, fed by the ephemeral module **[V]** by code reading; no variable or output carries it **[V]** |
| `noeviction` | same production test (parameter group) |
| Not publicly accessible | private subnets, SG ingress from the client group only; ElastiCache has no public endpoint option **[V]** |
| Testing unchanged without the cache | `testing_key_policy_is_unchanged_without_the_cache`, every cache resource `count = 0`, **and the offline plan comparison below** **[L]** |
| Other services keep their settings | `other_services_keep_the_ecs_deployment_defaults` |

**Found and fixed** (platform#114, commit `a36d0f6`): the AUTH-token precondition allowed `_`, `~` and `.`.
- The ElastiCache AUTH guide lists only `! & # $ ^ < > -` besides letters and digits. The API reference instead refuses `/ " @ %`. **[V-doc]**
- So a token that the plan accepted could fail `CreateReplicationGroup` at the production apply.
- Fix: narrowed to `[A-Za-z0-9-]{32,128}`, with a new test. The mutation back to the old class is caught **[L]**.
- Nothing exists yet, so nothing is affected. Details are in 06.

## D4. The first real non-production plan

### Method: offline plans of the applied commit and of main, compared

Testing's state was last applied from `67904bc` (Config A1, 10 Nov):
- **[V]** the post-apply plan, run 42766964719 (report `2026-11-10-identity-config-a1-continuation/01`), says "No changes";
- so the real state equals `67904bc`'s configuration under `nonprod.tfvars`.

**[L]** Both commits were planned offline:
1. `supporting/tools/offline-plan.sh` with an override file (`supporting/tools/zz_offline_override.tf.example`). Settings:
   - local backend, empty state;
   - fake keys, `skip_credentials_validation`, `skip_requesting_account_id`, `allowed_account_ids = null`;
   - `HTTPS_PROXY` set to a closed port, so any outbound call would fail;
   - no AWS credentials in the environment;
   - `-refresh=false`, `-var-file=envs/nonprod.tfvars`.

   Both plans completed without contacting anything. There are no non-local data sources: only `aws_iam_policy_document`.
2. `plan-diff.mjs` compared the two plans: the set of addresses, and every planned value.
3. `config-diff.mjs` compared every configuration expression. This catches attributes that are unknown in an empty-state plan, such as ARNs.
4. For the values that stay unknown (container definitions that embed secret ARNs), a mocked `terraform test` rendered them at both commits with identical ARN overrides (`supporting/tools/dump.tftest.hcl.example`), and the results were compared.

### Result: at rest (`services_enabled = false`, `edge_enabled = false`), the first plan after 67904bc

`supporting/nonprod-at-rest-plan-diff-67904bc-vs-47ffd08.txt`, `supporting/nonprod-config-diff-67904bc-vs-47ffd08.txt`:

| Address | Expected action | Cause |
| --- | --- | --- |
| `aws_secretsmanager_secret.service["docs-migrate"]` | **create** | platform#104/#105 (DC-01, L-5): the bundle follows `hosts.docs`, which nonprod sets |
| `aws_iam_role_policy.docs_db_admin_execution[0]` | **update in place** | #105: its Resource list gains the docs-migrate secret (expression diff; value unknown offline, so this rests on the expression diff plus `CONTRACT.md` "Pending plan delta") |
| everything else | no change | |

**Total expected: 1 to add, 1 to change, 0 to replace, 0 to destroy** **[L]** **[U]** (until the real plan). This matches the pending delta that `infra/aws/CONTRACT.md` already records.

Checked to be unchanged **[L]**:
- **Nothing from platform#110 or #114.** Every new cache, SNS, alarm and SG resource is `count = 0`. `aws_kms_key.data`'s policy is known offline and identical. The Identity module's new inputs (`deployment_*`, `single_task_store`, `extra_security_group_ids`) reach only `aws_ecs_service`, which does not exist at rest.
- **Identity task definitions are byte-identical** at both commits: `module.identity`, `module.migrate["identity"]` and `identity_bootstrap`, including the `valkey` sidecar. So the AW-01 merge (`identity_security_config` null) changes nothing, as #102 claimed.
- `db_admin`: expressions are unchanged.

### Provider initialization and AssumeRole

**[V]** `providers.tf` declares a second provider configuration, `aws.ephemeral_secrets`, with the same arguments as the default one: region, `allowed_account_ids`, `assume_role` to `var.deployer_role_arn`, default tags.

**[E]** Terraform normally configures every provider configuration that the configuration references, even when the module using it has `count = 0`. This was not checked against Terraform's documentation; the effect is bounded either way, as the next lines show.

**[E]** Expected effect in the real nonprod plan:
- one additional `sts:AssumeRole` by the CI role into `munaxa-shared-deployer-nonprod`, with source identity `github-actions`, visible in CloudTrail;
- **no** `secretsmanager:GetSecretValue`, because `module.identity_cache_auth` is `count = 0` without `identity_cache`.

The CI role's policy allows `sts:AssumeRole` + `sts:SetSourceIdentity` on its own deployer **[V]** (`bootstrap/iam.tf`), so the extra AssumeRole is permitted.

**[U]** Whether Terraform 1.16.5 skips configuring an alias that only a count-0 module uses. If it does, there is one AssumeRole fewer, which is harmless. If the alias's AssumeRole were refused, the plan would fail at provider configuration, before any change, so the failure is closed and visible.

### The session plan (`up`), after the at-rest apply

`aws-session.yml` refuses a session plan that changes any resource outside ALB, listeners, rules, target groups, ECS services, ACM validation and service discovery **[V]**.

**[R]** So the at-rest delta above **must be applied first**, through `aws-terraform.yml` with a declaring `envs/nonprod.expected-changes.json` **[O]**. Otherwise `up` fails at "Plan the switches".

In the session plan itself, the Identity `aws_ecs_service` is created with `deployment_minimum_healthy_percent = 0` and `deployment_maximum_percent = 100` **[L]** (stack test).

### When the Identity image changes (runbook 03)

Pinning a new Identity image, `identity_security_config` and a new `secret_version_ids.identity` produces two kinds of change:
- **New task definition revisions** for `module.identity` and `module.migrate["identity"]`, and probably `identity_bootstrap`. Task definitions are immutable, so each is a replacement. **[V]** `skip_destroy = true` keeps the old revision as a rollback target.
- **In-place updates of the execution-role policies** where the read secret keys change, for example `MFA_ENCRYPTION_KEYS`.

**[R]** That PR must:
- regenerate the expected-changes list with the same offline method, and declare it;
- also declare the docs-migrate delta, if it has not been applied by then.
