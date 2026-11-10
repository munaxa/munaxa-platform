# Identity preflight results review (10 Nov 2026 owner run)

- Date: 10 Nov 2026, 11:23 to about 12:00 UTC. Repository inspection and local tests only.
- Repositories:
  - `munaxa/munaxa-platform` `main` at `0bae671` (PR #77 merged);
  - `munaxa/munaxa-identity` at `5277d71`, the release the Testing images were built from.
- Input: the owner's summary of the preflight run.
  - **INCOMPLETE**: P-3 FAIL, P-4 FAIL, P-12 ERROR.
  - The caller was the account root user.
  - The raw output was not attached, so findings rely on the summary plus source.
- Labels:
  - **[V-src]** source read today, with path and line;
  - **[V-test]** local test run;
  - **[O]** owner run, as summarised by the owner.
- Not done:
  - no AWS CLI or connector call;
  - no Terraform plan or apply;
  - no IAM, KMS, Secrets Manager, ECS, RDS, network, DNS or Cloudflare change;
  - no deployment, migration, bootstrap or workflow dispatch;
  - no merge.

## 1. Result

**All three failed checks are preflight defects, not deployment defects.** The live task
definitions the owner observed match the Terraform source and the Identity release. The
expectations Claude wrote into the 10 Nov preflight (PR #76, carried into #77) were wrong, and so
was one command.

| Check                 | Owner observation [O]                                                 | Root cause                                                                                                                                 | Class                                                                                                    |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| P-3 (listing)         | Active task-definition listing returned empty                         | `ecs list-task-definitions --family-prefix munaxa-nonprod`: that parameter is the **exact** family name, so a prefix matches nothing (R-1) | **Preflight defect: wrong API usage**                                                                    |
| P-3 (bootstrap image) | Bootstrap task uses the API image digest, not the migrate digest      | The bootstrap task is defined on the Identity **api** image; the preflight expected the migrate image (R-2)                                | **Preflight defect: wrong expectation**. Deployment correct                                              |
| P-4                   | `identity-migrate` has no `DIRECT_DATABASE_URL` pinned to `a3cc6622…` | The migrate task is defined with **`DATABASE_MIGRATION_URL`** only; `DIRECT_DATABASE_URL` belongs to the bootstrap task (R-3)              | **Preflight defect: wrong expectation**. Deployment correct                                              |
| P-12                  | `cloudtrail-denials.py` not found next to the script                  | The script depended on a second file, downloaded separately from another folder (R-4)                                                      | **Preflight packaging defect**                                                                           |
| Caller                | Ran as `arn:aws:iam::229251310592:root`; the account guard passed     | The guard checked the account only, not the caller type (R-5)                                                                              | **Preflight gap**. Root read-only by the owner is allowed by policy, but it should be an explicit choice |

**Deployment-readiness verdict: unchanged, PARTIALLY READY — OWNER ACTIONS REQUIRED.**

- Nothing in the owner's run shows a deployment defect.
- The preflight has not yet produced a clean, complete result, so it must be re-run with the
  corrected script (section 6).
- Every other check passed or was not reported. The raw output would confirm which.

## 2. R-1: P-3 empty task-definition listing

**Evidence:**

- **Script on `main`.**
  - `2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh` (sha
    `deacf85b…`) called
    `aws ecs list-task-definitions --family-prefix munaxa-nonprod --status ACTIVE`.
  - The preparation report's P-3 row (`2026-11-10-identity-first-session-preparation/00-…md`
    line 199) gave the same command.
- **ECS API reference, `ListTaskDefinitions`, `familyPrefix`:**
  - "The full family name to filter the `ListTaskDefinitions` results with."
  - "Specifying a `familyPrefix` limits the listed task definitions to task definition revisions
    that belong to that family."
- **ECS API reference, `ListTaskDefinitionFamilies`, `familyPrefix`:**
  - "only task definition family names that begin with the `familyPrefix` string are returned".
  - With `status` `ACTIVE`, "only task definition families that have an `ACTIVE` task definition
    revision are returned".
- **Earlier scripts used the right call.** The 7 Nov scripts call `list-task-definition-families`:
  - `2026-11-07-release-readiness-verification/supporting/release-readiness-readonly-check.sh:130`;
  - `2026-11-07-testing-readiness-phase-1/supporting/phase1-readonly-check.sh:85`.

There is no family named `munaxa-nonprod`, so the empty result is what ECS returns for that call.
It says nothing about the four families. The per-family `describe-task-definition` calls in the
same check found all four, which agrees with this.

**Fix:**

1. `list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE` must return
   exactly the four A1 families.
2. Then `list-task-definitions --family-prefix <family> --status ACTIVE`, run for each family, must
   return exactly `<family>:1`.
3. The preparation report's P-3 row is corrected in place.

## 3. R-2: intended image for the bootstrap task

**Intended image: the Identity api (runtime) image**,
`…/munaxa-identity/api@sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156`.

Evidence [V-src]:

| Source                                                   | Line                                | Content                                                                                                              |
| -------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `infra/aws/stack/ops.tf`                                 | 250                                 | `resource "aws_ecs_task_definition" "identity_bootstrap"`                                                            |
| `infra/aws/stack/ops.tf`                                 | 268                                 | `image = var.images.identity_api`                                                                                    |
| `infra/aws/stack/ops.tf`                                 | 272                                 | command `node scripts/bootstrap-account.mjs --organisation … --organisation-name …`                                  |
| `infra/aws/stack/ops.tf`                                 | 191 to 198 (comment, from line 193) | "Identity's bootstrap scripts (…), run from the runtime image as identity_owner"                                     |
| `infra/aws/stack/services.tf`                            | 107                                 | the Identity service uses the same `var.images.identity_api`                                                         |
| `infra/aws/stack/envs/nonprod.tfvars`                    | 61                                  | `identity_api = "…/munaxa-identity/api@sha256:71d01fdf…"`                                                            |
| `infra/aws/stack/envs/nonprod.tfvars`                    | 62                                  | `identity_migrate = "…/munaxa-identity/migrate@sha256:d175ef37…"`, which only `module "migrate"` uses (`ops.tf:166`) |
| munaxa-identity `docs/runbooks/aws.md`                   | 77 to 78                            | The steps run as `munaxa-<env>-identity-bootstrap`: "the Identity `api` image as `identity_owner`"                   |
| munaxa-identity `apps/api/scripts/bootstrap-account.mjs` | 80 to 82                            | The script ships in the api app                                                                                      |
| Preparation report A-6 (#75)                             | line 57                             | "`munaxa-nonprod-identity-bootstrap` (runtime image, …)": already correct                                            |

The live task definition matches this. The wrong expectation (migrate digest) was introduced in the
readiness report's P-3 row (#76) and the script (#76, #77).

## 4. R-3: does the migration task need `DIRECT_DATABASE_URL`?

**No.** The migrate task takes **`DATABASE_MIGRATION_URL`** from `munaxa-nonprod/identity-migrate`,
pinned to `a3cc6622-df66-4787-bae7-83ccfec56ff4`. `DIRECT_DATABASE_URL` is the name the
**bootstrap** task gives the same reference.

Authoritative configuration [V-src]:

| Source                                 | Line       | Content                                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/aws/stack/ops.tf`               | 164 to 190 | `module "migrate"` (`modules/service`): `secret_arn = …["identity-migrate"]`, `secret_keys = local.secret_keys["identity-migrate"]` (184), `secret_version_id = lookup(var.secret_version_ids, "identity-migrate", "")`; comment 183 "Each product's migrate target points Prisma at DATABASE_MIGRATION_URL." |
| `infra/aws/stack/data.tf`              | 152        | `identity-migrate = ["DATABASE_MIGRATION_URL"]`                                                                                                                                                                                                                                                               |
| `infra/aws/modules/service/main.tf`    | 32         | each key becomes `{ name = key, valueFrom = "${secret_arn}:${key}::${secret_version_id}" }`, so the container secret is named `DATABASE_MIGRATION_URL`                                                                                                                                                        |
| munaxa-identity `apps/api/Dockerfile`  | 65 to 69   | migrate target: `CMD … export DATABASE_URL="$DATABASE_MIGRATION_URL" && exec … prisma migrate deploy`                                                                                                                                                                                                         |
| munaxa-identity `prisma/schema.prisma` | 19         | `url = env("DATABASE_URL")`: no `directUrl`, so Prisma never reads `DIRECT_DATABASE_URL`                                                                                                                                                                                                                      |
| `infra/aws/stack/ops.tf`               | 277        | the bootstrap task: `{ name = "DIRECT_DATABASE_URL", valueFrom = "…identity-migrate…:DATABASE_MIGRATION_URL::<pin>" }`                                                                                                                                                                                        |
| munaxa-identity `docs/runbooks/aws.md` | 83         | in the bootstrap section: "`DATABASE_MIGRATION_URL`, injected as `DIRECT_DATABASE_URL`"                                                                                                                                                                                                                       |
| Preparation report A-7 (#75)           | line 58    | "Migrate: `DATABASE_MIGRATION_URL` … Bootstrap: `DIRECT_DATABASE_URL` from the migrate bundle": already correct                                                                                                                                                                                               |

The readiness report's P-4 row (#76) wrongly merged the migrate and bootstrap entries.

Corrected P-4 for migrate:

- the container's secret names are exactly `DATABASE_MIGRATION_URL`;
- it references
  `…:secret:munaxa-nonprod/identity-migrate-XXXXXX:DATABASE_MIGRATION_URL::a3cc6622-df66-4787-bae7-83ccfec56ff4`.

The bootstrap checks are unchanged.

## 5. R-4 and R-5: helper path and root caller

### 5.1 R-4: helper path (packaging)

What the scripts did:

- The `#77` script resolved the helper as `$(dirname "$0")/cloudtrail-denials.py`.
- The procedure downloaded the helper separately from another report folder.

The owner's run did not find it. The cause could be a missed download, a different directory, or
running the script through a pipe, where `$0` is `bash`. The summary does not say which. Either way
the two-file procedure was fragile.

**Fix:**

- The filter is embedded in the script, byte for byte. A test compares it with
  `cloudtrail-denials.py`, so the 7 helper tests still cover it.
- The procedure downloads one file.
- Every test run copies the script **alone** into an empty directory, so a PASS proves the script
  needs no other file.

### 5.2 R-5: should the preflight reject root?

**Policy in force.** `infra/aws/ACCESS-POLICY.md`, 8 Nov 2026 owner decision:

- D-1: root plus the root connector is the approved development access method.
- D-4: no IAM user, role or Identity Center configuration is created solely to run read-only checks.
- §1.3 item 3: the owner's CloudShell scripts that stop on a root caller "may be run as root by the
  owner for read-only checks … with `ALLOW_ROOT_READONLY=yes` … that is the approved mode, not a
  deviation".
- §2 F-1 to F-3: Identity Center, an MFA operator identity and a ReadOnly permission set are
  deferred to the deployment stage.

**Conflict.** The request for "a read-only preflight procedure that uses the intended non-root
operator identity" conflicts with D-4 and §2 as they stand:

- no non-root operator identity exists;
- creating one now is an owner decision that changes the access policy;
- Claude has not created and will not create any IAM.

**Recommendation and change.** The preflight now rejects root explicitly unless the owner opts in.
This keeps the policy and makes root use deliberate. It reuses the 7 Nov pattern
(`release-readiness-readonly-check.sh:64-71`).

| Caller                                                                                                                                                                 | Behaviour                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arn:aws:iam::229251310592:root` without `ALLOW_ROOT_READONLY=yes` (exactly `yes`)                                                                                     | `STOP`, `OVERALL: NOT RUN (root caller not accepted)`, exit 3, no other AWS call                                                                                        |
| Root with `ALLOW_ROOT_READONLY=yes`                                                                                                                                    | Runs. P-1 records "root (accepted …, owner's decision)" plus a warning that root bypasses IAM, so a PASS proves nothing about deployer permissions (ACCESS-POLICY §1.2) |
| `arn:aws:sts::229251310592:assumed-role/<role>/<session>`, for example an Identity Center `AWSReservedSSO_ReadOnly_…` role, or `arn:aws:iam::229251310592:user/<name>` | Runs, no flag needed; P-1 records the role or user                                                                                                                      |
| Any other ARN shape, or an ARN of another account                                                                                                                      | `STOP`, `OVERALL: NOT RUN (caller not recognised)`, exit 3                                                                                                              |

## 6. Read-only preflight procedure (replaces readiness report section 5.2)

**A. Intended non-root operator identity (target).**

Prerequisites, owner decisions not yet taken:

- ACCESS-POLICY F-1 to F-3: Identity Center and a ReadOnly permission set.
- A policy update that lifts D-4 for this purpose.

The permission set must allow the script's 32 read operations, listed in its `ALLOWED_OPS`, and
nothing that reads secret values. Confirm this when F-3 is designed.

```bash
# Sign in through the IAM Identity Center portal with the ReadOnly permission set for 229251310592,
# then open CloudShell in eu-central-1.
mkdir -p ~/identity-preflight && cd ~/identity-preflight
B=https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports
# until this PR is merged, replace main with claude/project-thread-yi55u0
curl -sSfO $B/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
sha256sum preflight-readonly.sh
#   8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3  preflight-readonly.sh
bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
```

**B. Current approved mode (root, owner's explicit choice, ACCESS-POLICY §1.3).** Same commands,
signed in as root, with the last line replaced by:

```bash
ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
```

In either mode:

- Paste the whole output. The `OVERALL:` line is the result, because `tee` hides the exit code.
- No other file is needed.
- The script makes only allowlisted read calls (32 operations), never `get-secret-value`, and reads
  no Terraform state, logs or application data.

Expected P-3 and P-4 lines after the corrections:

- `families with an ACTIVE revision = munaxa-nonprod-db-admin,munaxa-nonprod-identity,munaxa-nonprod-identity-bootstrap,munaxa-nonprod-identity-migrate`;
- one `ACTIVE revisions = <family>:1` per family;
- `munaxa-nonprod-identity-bootstrap image @sha256:71d01fdf`;
- `identity-migrate secret names = DATABASE_MIGRATION_URL`;
- `identity-migrate DATABASE_MIGRATION_URL pinned to a3cc6622-…`.

## 7. Changes and tests [V-test]

Files changed:

- `2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh`. Was sha
  `deacf85b…`; now `8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3`.
  - R-1: P-3 lists families, then revisions for each family. The allowlist gains
    `ecs:list-task-definition-families` (32 operations).
  - R-2: the bootstrap image expectation is the api digest.
  - R-3: P-4 checks the migrate task for exactly `DATABASE_MIGRATION_URL` with its pin, and checks
    the bootstrap task separately.
  - R-4: the denial filter is embedded.
  - R-5: caller identity guard.
- `supporting/preflight_aws_stub.py`: `--family-prefix` is a selector, so the stub can model ECS
  exact-family listing.
- `supporting/preflight_readonly_test.py`:
  - the baseline caller is now an Identity Center ReadOnly role;
  - the baseline matches the stack source;
  - 11 tests added, 1 replaced.
- Reports:
  - the readiness report, section 5.2 (marked superseded) and the P-3, P-4 and P-12 rows of
    section 5.3;
  - the preparation report's P-3 row;
  - the index.

How to run the tests:

- `python3 -I preflight_readonly_test.py -v`, after `pip install jmespath`.
- Environment: bash 5.2.21, Python 3.13.18, jmespath 1.1.0.
- Result: **35 tests, 35 passed, 0 failed**.
- `cloudtrail_denials_test.py`: 7 tests, 7 passed.
- `bash -n`: passes.

New or changed tests, one per correction:

| Correction | Test                                                          | Asserts                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1        | `test_task_definitions_listed_per_exact_family`               | `list-task-definitions` called only with the four exact family names, never `munaxa-nonprod`; the families line PASSes (the stub returns an empty list for `munaxa-nonprod`, as ECS did) |
| R-1        | `test_extra_family_or_second_revision_fails`                  | An extra family or a second ACTIVE revision is a FAIL, exit 1                                                                                                                            |
| R-1        | `test_network_failure_is_error` (updated)                     | A failed family listing is an ERROR                                                                                                                                                      |
| R-2        | `test_bootstrap_on_api_image_passes`                          | Bootstrap on `@sha256:71d01fdf` PASSes                                                                                                                                                   |
| R-2        | `test_bootstrap_on_migrate_image_fails`                       | Bootstrap on the migrate image is a FAIL                                                                                                                                                 |
| R-3        | `test_migrate_needs_database_migration_url_only`              | Migrate with `DATABASE_MIGRATION_URL` pinned PASSes. The old expected shape (`DIRECT_DATABASE_URL`) is a FAIL                                                                            |
| R-3        | `test_migrate_with_unpinned_reference_fails`                  | A reference without the version pin is a FAIL                                                                                                                                            |
| R-4        | `test_denial_filter_is_embedded_and_identical_to_helper`      | The embedded filter equals `cloudtrail-denials.py`. The old "not found" path is gone. Every run uses the script alone                                                                    |
| R-5        | `test_root_is_refused_without_owner_flag`                     | Root: exit 3, `NOT RUN (root caller not accepted)`, 1 AWS call                                                                                                                           |
| R-5        | `test_root_flag_must_be_exactly_yes`                          | `1`, `true`, `YES` and empty are refused                                                                                                                                                 |
| R-5        | `test_root_with_owner_flag_runs_and_warns`                    | With `yes`: exit 0, PASS, accepted-root line and the IAM-bypass warning                                                                                                                  |
| R-5        | `test_non_root_role_and_user_need_no_flag`                    | SSO ReadOnly role and IAM user run without the flag                                                                                                                                      |
| R-5        | `test_caller_arn_from_another_account_or_unknown_shape_stops` | Another account's role, a federated user and `None`: exit 3, 1 call                                                                                                                      |

## 8. Owner actions

| #   | Action                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Review and merge this PR (Claude does not merge)                                                                                                                                                                                            |
| O-2 | Choose the identity for the re-run: B (root with `ALLOW_ROOT_READONLY=yes`, the policy's approved mode) now, or first decide to create the non-root ReadOnly identity, which changes ACCESS-POLICY D-4 and §2 (a separate, reviewed change) |
| O-3 | Re-run section 6 and paste the whole output (including the raw lines, so every check can be confirmed)                                                                                                                                      |
| O-4 | The G-4 GitHub UI check and the separate session approval are still pending (readiness report section 8)                                                                                                                                    |
