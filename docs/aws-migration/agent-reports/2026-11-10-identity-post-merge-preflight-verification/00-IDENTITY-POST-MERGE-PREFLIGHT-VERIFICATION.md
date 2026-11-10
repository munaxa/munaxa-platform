# Identity post-merge preflight verification (10 Nov 2026)

Scope: verify that PR #78 is merged as reviewed, validate the corrected preflight script on `main`,
run the local tests, report CI, reconcile the earlier reports, and give the owner the exact
CloudShell procedure.

This work used repository inspection, local offline tests and GitHub read access only:

- no AWS connector and no AWS API call;
- no Terraform, no workflow dispatch;
- no IAM, KMS, Secrets Manager, ECS, RDS, networking, DNS, Cloudflare or GitHub settings change;
- no merge.

Labels: **[V]** verified here, **[O]** owner action required, **[U]** unverified.

---

## 1. Verdict

**VERIFIED — READY FOR OWNER-RUN READ-ONLY PREFLIGHT**. All CI jobs on the `main` merge commit
succeeded (section 8). This is not an AWS-readiness verdict.

- PR #78 is merged, and `main` is byte-identical to the reviewed PR head [V].
- On `main`, the script implements the corrected P-3, P-4 and P-12 checks and the caller guard [V].
- It is read-only by construction [V].
- Local tests pass: preflight 35/35, CloudTrail 7/7, JWT 26/26, `bash -n` [V].
- The earlier reports now mark the old instructions as superseded (this PR) [V].
- Nothing about the live AWS state is verified here. That is what the owner-run preflight is for [O].

## 2. PR #78 merge [V]

| Item              | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| State             | Merged (squash), by `tam2om`, 2026-11-10 11:46:20 UTC                    |
| Merge commit      | `ae90b2d3c7ed09c4b0053d426867ccb2d29d49ac`, parent `0bae671` (PR #77)    |
| Reviewed PR head  | `005ad38c01b287df44b4c4527515939f6fb4a3c2`                               |
| Head vs `main`    | `git diff 005ad38 ae90b2d` is empty: the merged tree is the reviewed one |
| Commits after it  | None. `main` HEAD is still `ae90b2d` at 11:52 UTC                        |

## 3. `main` SHA [V]

`main` = `ae90b2d3c7ed09c4b0053d426867ccb2d29d49ac`. The last three commits are #78, #77 and #76.
All three are docs-only.

## 4. Changed files in #78 [V]

`git diff --name-status 0bae671 ae90b2d` lists seven files, all under
`docs/aws-migration/agent-reports/`:

| Status | File                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| M      | `2026-11-10-identity-first-session-preparation/00-IDENTITY-FIRST-SESSION-PREPARATION.md`       |
| M      | `2026-11-10-identity-preflight-and-session-readiness/00-IDENTITY-PREFLIGHT-AND-SESSION-READINESS.md` |
| M      | `…-session-readiness/supporting/preflight-readonly.sh`                                         |
| M      | `…-session-readiness/supporting/preflight_aws_stub.py`                                         |
| M      | `…-session-readiness/supporting/preflight_readonly_test.py`                                    |
| A      | `2026-11-10-identity-preflight-results-review/00-IDENTITY-PREFLIGHT-RESULTS-REVIEW.md`         |
| M      | `README.md`                                                                                    |

Nothing under `infra/`, `.github/`, `packages/` or `apps/` changed, so there was no unexpected
infrastructure, workflow, IAM or deployment change.

SHA256 of the files on `main`, from `git show origin/main:<path> | sha256sum`:

| File                     | SHA256                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| `preflight-readonly.sh`  | `8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3` |
| `cloudtrail-denials.py`  | `ed3711dabcfd29d2514ea75a56637913a02164afaf4b33516e81a07daf7f12f8` |
| `preflight_aws_stub.py`  | `cde1a16a647a13c1bffb30b196ec5bb72640a6e5b94cc1e13d5f85efb71265b1` |
| `preflight_readonly_test.py` | `714589af01174d2dd252888b44b1c8aad6aac0888f1548069804806b5a7b41f3` |

## 5. P-3, P-4, P-12 and caller guard on `main` [V]

Line numbers refer to `preflight-readonly.sh` at `ae90b2d`.

### 5.1 P-3: task-definition families and revisions

- Line 236 runs `ecs list-task-definition-families --family-prefix munaxa-nonprod --status ACTIVE`.
  The result must be exactly
  `munaxa-nonprod-db-admin,munaxa-nonprod-identity,munaxa-nonprod-identity-bootstrap,munaxa-nonprod-identity-migrate`.
  An extra or missing family fails.
- Lines 241-244 then run `ecs list-task-definitions --family-prefix munaxa-nonprod-<family> --status ACTIVE`
  once per family. In this call the parameter is the exact family name (AWS ECS API reference), so
  each family must have exactly one ACTIVE revision, `<family>:1`. A second ACTIVE revision fails.
- Line 247: the image loop expects `identity-bootstrap` to run the API image
  `sha256:71d01fdf82b8d92032d7580963e9ecdb263c8a2533484c5e8701dca1e93c8156`, the same image as
  `identity`, and not the migrate image. This matches the source: `infra/aws/stack/ops.tf:268`
  `image = var.images.identity_api`, and `stack/envs/nonprod.tfvars:61`.

### 5.2 P-4: secret references

- **Migrate task**, lines 280-287:
  - the secret names must be exactly `DATABASE_MIGRATION_URL`, so any extra name fails;
  - the reference must match
    `:secret:munaxa-nonprod/identity-migrate-XXXXXX:DATABASE_MIGRATION_URL::a3cc6622-df66-4787-bae7-83ccfec56ff4`.
  - Source: `stack/ops.tf:184` (`secret_keys = local.secret_keys["identity-migrate"]`),
    `stack/data.tf:152` (`["DATABASE_MIGRATION_URL"]`), and the tfvars pin at `nonprod.tfvars:84`.
- **Bootstrap task**, lines 289-295, a separate check:
  - `DIRECT_DATABASE_URL` must reference the same `identity-migrate` secret key with the same pin
    (source `stack/ops.tf:277`);
  - plus the `IDENTITY_OWNER_EMAIL` and `IDENTITY_OWNER_PASSWORD` references to `identity-bootstrap`.
- Only `ecs describe-task-definition` output is read, which carries names and ARNs and never values.

### 5.3 P-12: CloudTrail denials

- The filter is embedded as a `<<'PY'` heredoc in `DENIAL_FILTER` and run with
  `python3 -I -c "$DENIAL_FILTER"` (line 462). No separate file is needed.
- It is byte-identical to the tested helper `cloudtrail-denials.py`, 55 lines. This is checked by
  `test_denial_filter_is_embedded_and_identical_to_helper`.
- Line 459 loops over `eu-central-1` and `us-east-1`.
- The filter matches `AccessDenied*` and `*UnauthorizedOperation` in each event's `errorCode` only.
- Pagination: line 460 calls `lookup-events --output json` with no `--max-results`, `--max-items`
  or `--no-paginate`, so the CLI fetches every page.
- Results: exit 0 is PASS, 1 is FAIL, and any other exit is ERROR.
- The window starts at `PREFLIGHT_SINCE`, default `2026-11-10T06:00:00Z` (line 27).

### 5.4 Caller guard

- **Account.** Lines 159-178 run `sts get-caller-identity` first. A failure, an empty answer or any
  account other than `229251310592` prints `OVERALL: NOT RUN` and exits 3 before any other call.
- **Root.** Lines 181-200: `arn:aws:iam::229251310592:root` is refused with exit 3 unless
  `ALLOW_ROOT_READONLY` is exactly `yes`. Accepted root runs print the IAM-bypass warning: a PASS
  proves nothing about any deployer's permissions (ACCESS-POLICY §1.2).
- **Roles and users.** An assumed role or IAM user of the same account is accepted with no flag.
- **Anything else.** Federated users, other ARN shapes and foreign accounts stop with exit 3 after
  the single sts call.

## 6. Read-only review [V]

The review covered the actual commands and control flow, not only the comments.

- Only two lines call `aws` directly:
  - line 145 is inside `aws_call`, after the allowlist check at line 141;
  - line 166 is the `sts get-caller-identity` guard.
- The 31 `aws_call` sites all name allowlisted operations.
- The allowlist `ALLOWED_OPS` (line 37) has 32 operations. All are `describe-*`, `list-*` and `get-*`
  metadata reads, plus `sts get-caller-identity` and `cloudtrail lookup-events`.
- A call outside the allowlist is refused and recorded as ERROR. It is never run.
- The script contains none of the following, comments excluded:
  - `get-secret-value`, `batch-get-secret-value`;
  - `terraform`, `tfstate`, `s3`, `logs`;
  - `--max-results`, `--max-items`, `--no-paginate`.
- The secrets calls are `describe-secret`, `list-secret-version-ids` and `list-secrets`, which
  return metadata only.
- Any write-verb matches turned out to be false positives (`--start-time`, "backstop").
- Status logic:
  - a failed command is ERROR, never PASS;
  - ABSENT is only an AWS error code matching the check's own regex, never a CLI or network failure;
  - OVERALL is PASS only when there are no ERROR or FAIL lines.

## 7. Local tests [V]

Environment:

- a clean worktree of `ae90b2d`;
- Python 3.13.18, bash 5.2.21, Node from the session image;
- `jmespath 1.1.0` installed only in an isolated venv in the session scratchpad;
- nothing installed in the repository.

| Command (from `supporting/` of each report folder)    | Result                       |
| ----------------------------------------------------- | ---------------------------- |
| `bash -n preflight-readonly.sh`                       | exit 0                       |
| `<venv>/bin/python3 -I preflight_readonly_test.py -v` | `Ran 35 tests … OK` (~51 s)  |
| `python3 -I cloudtrail_denials_test.py -v`            | `Ran 7 tests … OK`           |
| `node --test verify-identity-jwt.test.mjs`            | 26 pass, 0 fail              |

The script was also run on its own in an empty directory, with the stub CLI on `PATH`:

| Scenario                          | Exit | AWS calls | Result                                                  |
| --------------------------------- | ---- | --------- | ------------------------------------------------------- |
| Non-root SSO ReadOnly role, no flag | 0  | 47        | P-3, P-4, P-12 lines PASS; `OVERALL: PASS`              |
| Root, no flag                     | 3    | 1         | `STOP … root`; `OVERALL: NOT RUN`                       |
| Root, `ALLOW_ROOT_READONLY=yes`   | 0    | 47        | `WARNING: running as root …`; `OVERALL: PASS`           |
| Foreign account                   | 3    | 1         | `OVERALL: NOT RUN (wrong account)`                      |
| Federated-user ARN                | 3    | 1         | `OVERALL: NOT RUN (caller not recognised)`              |
| `AccessDenied` on RDS             | 2    | 47        | P-2 ERROR; `OVERALL: INCOMPLETE`                        |
| ECS service-linked role absent    | 1    | 47        | `NoSuchEntity` classified ABSENT → FAIL; `OVERALL: FAIL` |

These runs prove the logic only, against stubbed AWS answers. They prove nothing about AWS.

## 8. GitHub CI [V]

| Run                          | Event             | Commit    | Job                                    | Result                                 |
| ---------------------------- | ----------------- | --------- | -------------------------------------- | -------------------------------------- |
| CI 42808203221               | PR #78            | `005ad38` | Lint · Typecheck · Test · Build        | success                                |
|                              |                   |           | Façades match the platform surface     | success                                |
|                              |                   |           | Accessibility                          | success                                |
| AWS Terraform 42808203348    | PR #78            | `005ad38` | Format, validate, mocked plan tests    | success                                |
|                              |                   |           | Plan, Apply                            | **skipped** (not dispatched; no AWS)   |
| CI 42810181227               | push to `main`    | `ae90b2d` | Lint · Typecheck · Test · Build        | success (11:48 UTC)                    |
|                              |                   |           | Façades                                | success                                |
|                              |                   |           | Accessibility                          | success (11:59:57 UTC)                |

- **AWS Terraform has no push run.** `.github/workflows/aws-terraform.yml` triggers only on
  `pull_request` to `main` and on `workflow_dispatch`, so there is no run for `ae90b2d`. Its last
  result is the PR run above.
- **Skipped is not success.** Plan and Apply did not run.

**Observation.** Scheduled `aws-session.yml` run #18 (42785877006, event `schedule`, 08:51 UTC on
`46c50f8`) succeeded. Its jobs were "Stop the database" and "Testing down". Claude did not trigger
it. It falls inside the P-12 window, so any denial it produced will show in P-12.

## 9. Owner actions [O]

| #   | Action                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Review and merge this docs PR. Claude does not merge. The preflight script does not depend on it: the script on `main` is final for this run                                    |
| O-2 | Run section 10, mode B, in CloudShell yourself, and paste the whole output                                                                                                      |
| O-3 | G-4: check environment `aws-nonprod-session` in the GitHub UI (readiness report section 8). Still open                                                                         |
| O-4 | The Identity session (`aws-session.yml`) still needs your separate approval after the preflight review. This procedure does not ask you to dispatch it                          |

## 10. Owner CloudShell procedure

Account `229251310592`, region `eu-central-1`. This procedure creates nothing: no role, user or
access key.

**Caller mode.**

- **A, non-root ReadOnly role:** only if such a role already exists and you have authorized its use.
  Under ACCESS-POLICY D-4 none has been created, so this mode is not available today. Do not create
  one for this run.
- **B, root with `ALLOW_ROOT_READONLY=yes`:** your decision of 11:33 UTC, per ACCESS-POLICY §1.3.
  Use this mode.

```bash
# CloudShell, region eu-central-1, signed in as root (mode B) or as the existing ReadOnly role (mode A)
mkdir -p ~/identity-preflight && cd ~/identity-preflight
curl -sSfO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/docs/aws-migration/agent-reports/2026-11-10-identity-preflight-and-session-readiness/supporting/preflight-readonly.sh
sha256sum preflight-readonly.sh
#   expected: 8208beeffdf82d54a1729ee37835cdba10495b7bcad3e1c21807dc0f302107f3  preflight-readonly.sh
#   any other value: stop and do not run it

# mode B (root):
ALLOW_ROOT_READONLY=yes bash preflight-readonly.sh 2>&1 | tee preflight-$(date -u +%Y%m%dT%H%MZ).txt
# mode A (existing ReadOnly role only): same line without ALLOW_ROOT_READONLY=yes
```

- Download only this one file. No helper and no test file is needed.
- Paste the whole output, including:
  - the caller identity line (P-1);
  - every P-1 to P-13 line;
  - both P-12 lines (`eu-central-1` and `us-east-1`);
  - the final `OVERALL:` line. `tee` hides the exit code, so this line is the result.
- **What a PASS proves under root.** Root bypasses IAM. A PASS shows the resources are in the
  expected state. It does not show that the deployment roles have the permissions they need.
- **If you see an ERROR line**, stop and paste the output. Do not change anything to make it pass.
- **Do not dispatch the session** as part of this step.

Expected P-3 and P-4 lines:

- `families with an ACTIVE revision = munaxa-nonprod-db-admin,munaxa-nonprod-identity,munaxa-nonprod-identity-bootstrap,munaxa-nonprod-identity-migrate`;
- four lines of `… ACTIVE revisions = <family>:1`;
- `munaxa-nonprod-identity-bootstrap image @sha256:71d01fdf…`;
- `identity-migrate secret names = DATABASE_MIGRATION_URL`;
- `identity-migrate DATABASE_MIGRATION_URL pinned to a3cc6622-…`;
- `identity-bootstrap DIRECT_DATABASE_URL pinned to a3cc6622-…`.

**Report reconciliation done in this PR.** No policy text changed.

- **First-session preparation report:**
  - §3.2 is marked superseded for execution and points here;
  - the P-12 row notes the embedded filter;
  - step 23, a post-session check that still uses the helper, gains a single-file download line
    with its SHA256.
- **Readiness report:** the "31 read operations" bullet now says 32 since #78. Historical
  §11.2 is left as written, pinned to its old hash. §5.2 was already marked superseded in #78.
- **Results review:** the "until this PR is merged" download note now says to use `main`.

## 11. No AWS changes

This task made no AWS API call and did not use the AWS connector. It did not:

- run Terraform plan or apply;
- dispatch any workflow;
- create or change any IAM, KMS, Secrets Manager, ECS, RDS, networking, ALB, DNS, Cloudflare or
  GitHub environment setting;
- run a migration or bootstrap;
- merge anything.

The only changes are the Markdown files in this PR.

## 12. Safe to proceed?

Yes, to the **owner-run read-only preflight** (section 10, mode B). The script on `main` is the
reviewed one, it is read-only, it guards the account and caller, and its checks match the source.

This is not approval for the Identity session and not a claim that AWS is ready. That depends on
the preflight output, its review, G-4, and your separate session approval.
