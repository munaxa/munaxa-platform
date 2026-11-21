# 01. Repository state, merged code and tests (19 Nov 2026)

## 1. `main` and the merged PRs (verified on GitHub at 09:00 UTC)

| PR | Merge commit | Merged (UTC) | CI on the `main` push |
| --- | --- | --- | --- |
| #139 R-8, bootstrap flag default true | `ff8733cf5e065b85fb1cbfc27a9b24864ebeefab` | 19 Nov 03:17 | run 44450393033 **success** |
| #140 H-20 gate enforcement | `4591bda004af8d1c06d67aa1a60e65430b7af360` | 19 Nov 03:31 | run 44452072489 **success** |
| #138 report (post D-B3 to D-B4) | `0f06836c06b2c76ab62699489e67e040a867b360` | 19 Nov 03:57 | run 44455025392 **success** |

Each was merged on the owner's yes ("Subscribe run merge", 03:16 UTC). The current `main` is `0f06836`. No bootstrap or workflow file changed after it.

**Bootstrap changes since the D-B2R apply (`a976b1a`, applied 18 Nov 13:37 UTC):**

| File | Blob | Change |
| --- | --- | --- |
| `infra/aws/bootstrap/iam_session.tf` | `aefbe51c…` | #140: the `GateSessionCleanup` dynamic statement (nonprod and flag only) |
| `infra/aws/bootstrap/variables.tf` | `f3ea818f…` | #139: `testing_session_cleanup` default `true` |
| `infra/aws/bootstrap/iam_session_cleanup.tf` | `4419ba74…` | #139: comment only |
| `infra/aws/bootstrap/tests/bootstrap.tftest.hcl` | `60384eab…` | #139 and #140 tests |

The plan script pins exactly these four files and blobs.

## 2. R-8

- `variables.tf`: `default = true`, with a comment saying why.
- Tests:
  - `r8_session_cleanup_is_on_without_the_var`: with no `-var`, the nonprod boundary statements, `deployer_session_cleanup` and `RefreshSessionCleanup` are all present, and nothing changes for prod.
  - `r8_explicit_true_matches_the_default`: an explicit `true` gives the same IAM.
  - `be2_session_cleanup_is_off_only_when_false`: `false` still removes all of them.
- The owner plan still passes `-var testing_session_cleanup=true` explicitly, so the result does not depend on the default.

## 3. H-20 enforcement

**Gate script.** `scripts/aws/session-cleanup-gate.sh` (SHA-256 `d0776aa6…c67c1`):
- It is read-only. Every check is a `describe`, `list` or `get` call.
- It runs the 10 conditions listed in report 2026-11-18 file 17 §3.
- It fails closed:
  - any AWS error, malformed JSON or missing field makes its condition false;
  - an invalid `hard_stop_utc` aborts;
  - the exit code is non-zero unless all 10 conditions pass.

**Workflow** `.github/workflows/aws-session.yml` (checked at `0f06836`):

| Step | Condition |
| --- | --- |
| `H-20 gate` (id `h20`) | `env.SESSION == 'up'` |
| `terraform init`, `Plan the switches`, `Apply the switches` | `stack exists && (env.SESSION != 'up' \|\| steps.h20.outcome == 'success')` |
| `Start the database` | `env.SESSION == 'up' && stack exists && steps.h20.outcome == 'success'` |
| Final `Stop the database` | `down` always. On `up`, only after a later failure, and **not** after a failed gate (review M-1) |

Conclusions:
- The gate is the first step for `up`, before init, plan, the database start and apply.
- `down` never runs the gate, and none of its steps depends on the gate.
- The separate database-stop job runs on `down` only.
- There is no `continue-on-error` in the workflow.

**IAM.** `GateSessionCleanup` grants `states:ListExecutions` on `arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup` and `states:DescribeExecution` on `arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*`.
- These match the Step Functions resource types:
  - `ListExecutions` authorizes on the state machine ARN;
  - `DescribeExecution` authorizes on the execution ARN, `execution:<state machine name>:<execution name>`.
- The statement exists only when `each.key == "nonprod"` and the flag is on.
- It names no prod resource. The tests `h20_gate_reads_never_reach_prod` and `h20_nonprod_session_reads_name_no_prod_resource` pin that.
- The gate's other reads come from existing grants: `DescribeStateMachine` in `RefreshSessionCleanup`, and the scheduler and CloudWatch reads in `deployer_read`. The test `h20_gate_reads_only_the_cleanup_executions` pins that.

## 4. Tests run on 19 Nov 2026 (local, at `0f06836`)

| Suite | Result |
| --- | --- |
| `infra/aws/bootstrap`: `terraform test` (Terraform 1.16.5, aws 6.67.0, mocked provider) | **20 passed, 0 failed** |
| `scripts/aws/connector` (pytest; includes the gate's 22 workflow, parity and live-sandbox-error tests) | **141 passed** |
| `bash -n scripts/aws/session-cleanup-gate.sh` | OK. `shellcheck` is not installed locally, but CI runs it on every push |
| New: `supporting/test_h20_iam_owner_scripts.py` (stubbed aws and terraform; real bash, jq, git and the Terraform zip checksum) | **19 passed**. Covers the happy path and 12 plan refusals (other PIN, account, lock, backend, live drift, summary, extra resource, replace, drift in JSON, other attribute, a wider resource, an extra action, the state count). Also covers 5 apply cases: happy, wrong SHA, no verified plan, post-apply changes, live differs |

**Offline render.** The expected session-read policy was rendered from `0f06836` by the real aws provider 6.67.0. `aws_iam_policy_document` is computed locally, with fake credentials and no AWS call. The render is 1,798 characters and equals the expected JSON in the plan script.
