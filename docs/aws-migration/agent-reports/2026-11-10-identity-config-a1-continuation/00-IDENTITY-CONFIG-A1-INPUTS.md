# Identity-only Testing preparation, Config A1: the inputs PR

- Date: 10 Nov 2026, work 05:15 to 05:30 UTC
- Thread: "Prepare Identity-only Testing deployment (Config A1)"
- Requested by: Tamer ("Continue Munaxa Identity-Only Testing Preparation — Config A1 Inputs", 05:15 UTC)
- Builds on: [`2026-11-09-identity-config-a1-preparation/`](../2026-11-09-identity-config-a1-preparation/) (PR #69, merged) and
  [`2026-11-09-identity-config-a1-continuation/`](../2026-11-09-identity-config-a1-continuation/) (PR #72, open at the time of writing)
- Labels: **[V]** verified, **[O]** owner action required, **[U]** unverified

## Verdict

**Inputs PR prepared and validated locally. It has not been merged, planned, applied or verified on AWS.**

| Stage | Status |
| --- | --- |
| Prepared (code, declaration, guide, generator, runbook) | Done, PR #69 merged (`9c7833f`) |
| Owner inputs | Done by the owner on 9 to 10 Nov, owner-reported. Claude checked only the public values (section 4) |
| Inputs PR | **Opened**, this PR. Not merged |
| Real AWS plan | **Not run** |
| Applied | No |
| Verified on AWS | No |

## 1. Files changed

| File | Change |
| --- | --- |
| `infra/aws/stack/envs/nonprod.tfvars` | Config A1 inputs from `supporting/nonprod.config-a1.tfvars.TEMPLATE`: Identity images, `valkey_image`, `postgres_image`, `db_bootstrap_products = ["identity"]`, `identity_signing_kid`, `identity_public_keys`, `secret_version_ids` (2 entries), `desired_counts` with only Identity at 1. Everything else is unchanged. |
| `infra/aws/stack/envs/nonprod.expected-changes.json` | Replaced the backstop declaration (already applied 6 Nov) with the 22-create Config A1 declaration. The file is byte-identical to `supporting/nonprod.expected-changes.config-a1.DRAFT.json` from PR #69. |
| `docs/aws-migration/agent-reports/2026-11-10-identity-config-a1-continuation/` | This report, plus `supporting/config-a1-inputs-mocked.tftest.hcl` and `supporting/inputs-pr-mocked-plan-addresses.txt`. |
| `docs/aws-migration/agent-reports/README.md` | Index row. |

No `.tf` code changes. `docs.tf` keeps `count = local.docs_defined && var.postgres_image != "" ? 1 : 0`
for `aws_ecs_task_definition.docs_db_admin`.

## 2. PR and branch

- Branch: `claude/identity-config-a1-inputs`, from `main` at `6496a80`.
- PR: [#73](https://github.com/munaxa/munaxa-platform/pull/73), not merged.

## 3. Values in the inputs

| Input | Value | Source |
| --- | --- | --- |
| `images.identity_api` | `…/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156` | PR #69 §5; ECR re-read 9 Nov 13:42 UTC [V] |
| `images.identity_migrate` | `…/munaxa-identity/migrate@sha256:d175ef37601673dc744144d62a15515b4b0823f1dd21204753f37d158e2a0820` | same [V] |
| `valkey_image` | `public.ecr.aws/valkey/valkey@sha256:757b7e559b14512bcc252949b13b717385d9381ed42e6b325982d03f4a5c8e8e` | PR #69 §5 [V] |
| `postgres_image` | `public.ecr.aws/docker/library/postgres@sha256:5983db9a9c6ad225a48a46cfe2e03e6680b1826662befd0465eb05b34cb1c64e` | PR #69 §5 [V] |
| `db_bootstrap_products` | `["identity"]` | template |
| `identity_signing_kid` | `identity-nonprod-2026-11` | owner, matches the decision |
| `identity_public_keys` | one P-256 SPKI public key, kid `identity-nonprod-2026-11` | owner's `identity_public_keys.json`, uploaded 05:18 UTC |
| `secret_version_ids.identity` | `ad02f18e-f3e7-41da-9959-f9b41e0b7e1a` | owner, `AWSCURRENT` of `munaxa-nonprod/identity` [U in AWS] |
| `secret_version_ids.identity-migrate` | `a3cc6622-df66-4787-bae7-83ccfec56ff4` | owner, `AWSCURRENT` of `munaxa-nonprod/identity-migrate` [U in AWS] |
| `desired_counts` | `identity = 1`; `control-api`, `control-portal`, `work-api`, `work-admin`, `school-api`, `school-admin`, `docs-api`, `docs-web`, `docs-scanner` = 0 | template; same 10 keys as before |

Still unchanged: `edge_enabled = false`, `services_enabled = false`, the backstop schedule, all six
`hosts`, `certificate_domains`, `operator_cidrs = []`, `operator_access` unset, database and log
settings, and `docs_redis_image`. No Control, Work, School or Docs image is set.

## 4. Checks on the public inputs

**Public key.** The key pasted in the thread at 05:15 UTC was incomplete. The first base64 line had 52
characters instead of 64, it decoded to 82 of 91 DER bytes, and Node refused it. The work stopped there
and the owner was asked for the file. The owner then uploaded `identity_public_keys.json` (05:18 UTC),
which is complete. The missing 12 characters were `CAQYIKoZIzj0`, part of the fixed P-256 algorithm
header. The EC point itself is the same in both. Checks on the uploaded file [V]:

- JSON array with one element whose keys are exactly `kid` and `publicKey`. `kid` = `identity-nonprod-2026-11`.
- Node `createPublicKey` loads it: type `ec`, curve `prime256v1` (P-256). Re-exporting it as SPKI PEM
  gives the same text. Line lengths 26/64/60/24, as the generator writes them.
- No `PRIVATE` anywhere.
- The tfvars line was built with `JSON.stringify` of the file's text, which is exactly how the
  generator builds `identity-a1.auto.tfvars.snippet`. Terraform reads it back as a string that
  `jsondecode`s, which passes the variable's validations: valid JSON, no private key, and the kid
  listed when a session has Identity.

This shows that the public key is well-formed. It cannot show that it is the half of the private key
in `munaxa-nonprod/identity`, because that value is never read. That match is first proven at runbook
step 19 (a token signed by Identity verifies with this key).

**Version ids.** Both are well-formed lowercase UUIDs. They were **not** checked in AWS in this task:
no AWS call was made. A wrong id does not fail the plan; it fails when a task starts
(`ResourceInitializationError`). Before the apply, the owner can check them read-only:
Secrets Manager, each secret, Versions tab, `AWSCURRENT`. Claude can also do it with `ListSecretVersionIds`
(metadata) if the owner authorizes it.

## 5. Tests and validation (local, Terraform 1.16.5, AWS provider 6.67.0, no AWS)

| Check | Result |
| --- | --- |
| `terraform fmt -check -recursive` (stack) and `fmt -check envs/nonprod.tfvars` | pass |
| `terraform validate` | "Success! The configuration is valid." |
| `terraform test` (stack, CI suite) | **26 passed, 0 failed** |
| `check-plan-intent.sh --validate infra/aws/stack/envs/nonprod.expected-changes.json` | "Declaration valid: root stack-nonprod, 22 declared change(s)." |
| Declaration vs the PR #69 draft | byte-identical (`cmp`) |
| New mocked test `supporting/config-a1-inputs-mocked.tftest.hcl` with `-var-file=envs/nonprod.tfvars`, **no variable overrides** for the A1 runs, so the PR's real values are used | **3 passed** |
| — baseline (A1 inputs blanked, as on `main` before this PR), apply into mocked state | no product resource |
| — this PR's tfvars, services off | **Plan: 22 to add, 0 to change, 0 to destroy** |
| — the 22 planned addresses vs the declaration | **identical** (sorted `diff`, no difference) |
| — `docs_db_admin` | not planned (asserted, and 0 matches in the addresses) |
| — Control, Work, School modules | 0 instances (asserted) |
| — session up (`edge_enabled` and `services_enabled` true) | 33 to add (the 22 plus the 11 session resources), 0 change, 0 destroy |
| Values reaching the mocked plan | both version ids appear in the rendered `valueFrom` references; the kid, all four digests present; no private key material (the only `PRIVATE` is the bundle key name `IDENTITY_SIGNING_PRIVATE_KEY` in a `valueFrom` ARN) |
| `pnpm format:check` | pass |

The PR #69 supporting test (`config-a1-mocked.tftest.hcl`) now fails its first run when used with the
new tfvars. That is expected: its baseline asserts that `nonprod.tfvars` is `main` *before* the inputs.
Its other three runs still pass. The new supporting test replaces it for this PR.

**The mocked tests are not an AWS plan and do not prove AWS permissions.** Only the real plan (section 8)
is evidence of what AWS will do.

## 6. Internal consistency

Consistent [V]:
- The kid in `identity_signing_kid` is the kid inside `identity_public_keys`.
- The declaration and the planned creates are the same 22 addresses.
- `db_bootstrap_products` is `["identity"]`, and `secret_version_ids` pins exactly the two bundles it reads (`identity`, `identity-migrate`).
- `desired_counts` covers every key the stack looks up, and only Identity is at 1.
- The images match PR #69 and the ECR re-read.

## 7. Secret handling

- No secret value was retrieved, displayed, logged or copied.
- No AWS call of any kind was made in this task, so not even metadata was read.
- `munaxa-nonprod/identity-bootstrap` was not created.
- The uploaded file holds only the public key. It was checked for `PRIVATE` before use.
- The repository files, this report and the PR hold only public values: the public key, version ids and digests.

## 8. Remaining blockers and next owner action

| # | Item | Who |
| --- | --- | --- |
| B-3 | Review and merge this inputs PR (its checks must be green) | **Owner** [O] |
| B-5 | Dispatch the real plan and review it against the 22 addresses | Owner dispatches; Claude and owner review |
| B-6 | Separate approval of that exact plan, then apply (runbook step 7) | Owner |

**Next owner action:** review this PR. Merge it only when you are ready to run the plan straight
afterwards. From the merge until the apply, the scheduled `aws-session` runs (19:17 and 01:47 UTC) fail
safely at "Plan the switches", and the 21:00 UTC backstop still runs.

Then, to plan:
1. GitHub, `munaxa/munaxa-platform`, Actions, **`aws-terraform.yml`**, Run workflow.
2. Branch `main`, environment **`nonprod`**, action **`plan`**.
3. Post the run link in the thread.

Expected: **22 to add, 0 to change, 0 to destroy**, exactly the addresses in
`supporting/inputs-pr-mocked-plan-addresses.txt`.

**Stop (no apply)** if the plan shows any of these:
- a database, VPC, subnet, route, ACM, backstop or scheduler change;
- any production resource, or any Control, Work, School or Docs resource;
- any IAM change outside the six declared roles and policies;
- any address outside the 22;
- any update, replacement or destroy.

The declaration is not edited to make a plan pass.

## 9. Not done

No AWS plan was dispatched. No Terraform apply or destroy, and no AWS call. No Secrets Manager read or
write, no IAM, KMS, database migration, bootstrap, ECS task or service. No DNS, Cloudflare, GitHub setting,
production, Render, Supabase or CanteenHub action. No PR was merged.
