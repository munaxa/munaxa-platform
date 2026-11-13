# 07. Independent security review

An independent reviewer (a separate Claude agent, given the code and the owner's requirements, not the author's conclusions) reviewed PR #121 and the stage C procedure in two rounds. It ran Terraform tests and synthetic `check-plan-intent.sh` plans on its own copies. It made no AWS call and changed nothing in the repository.

## Round 1: PR #121 at `4cd8f1a`, REQUEST CHANGES

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | **High** | The merge blocker (`secret_version_ids.identity` still `ad02f18e`, which holds no `MFA_ENCRYPTION_KEYS`) rested only on a comment and the draft flag. If merged and applied, the plan and intent check would pass and Identity would fail to start at the next session (fail closed, no exposure) | **Fixed** in `3ca18ce`: the declaration now describes the post-stage-C plan, so with `ad02f18e` the real plan lacks a declared change and `--enforce` refuses the apply (06, `supporting/check-plan-intent-enforce-synthetic.txt`) |
| 2 | **Medium** | `aws_ecs_task_definition.db_admin[0]` is also replaced when the identity version changes (`IDENTITY_APP_URL`, `ops.tf:138-141`) and was not declared | **Fixed** in `3ca18ce`: declared `["delete","create"]` (6 changes) |
| 3 | Low | The intent text would be out of date | **Fixed** in `3ca18ce` |
| 4 | Info | Stage C must copy every existing key and generate fresh material; migrate before the service rolls | Covered by the procedure (04) and runbook 03 |

Confirmed correct in round 1: both digests; no secret material; the kid against both validations and Identity's rule; `mfa_policy = "off"`; everything the hardened image needs to start; bootstrap and migrate still work with the new images; the three Identity replacements as `["delete","create"]`; no Identity IAM change; the docs-migrate delta; no production impact.

## Round 2: PR #121 at `3ca18ce`, APPROVE as a draft; procedure APPROVE with changes

PR: enforcement verified in both directions (missing and extra changes refused; `aws-terraform.yml` runs `--enforce` before saving the plan; `aws-session.yml` refuses task-definition changes). `secret_version_ids["identity"]` is used in exactly four places, all covered or inactive in nonprod.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| P-L1 | Low | The blocker is enforced as a side effect of the declaration; someone could delete the db-admin entry to "fix" a refused apply | **Accepted** with a reviewer note in the PR body. A precondition hard-coding a version id in code was rejected as brittle. Any edit to the declaration is itself a reviewed PR change |
| P-I1 | Info | Merged early, every nonprod apply is refused until the version is fixed | Accepted: safe, and the PR stays a draft |
| C-1 | **Medium** | Pasting the script with `set -euo pipefail` into the interactive CloudShell shell could close the session on an abort and lose the `ABORT` line | **Fixed**: the body runs in a child shell (`bash <<'SH'`); stub test shows the outer shell survives an abort |
| C-2 | **Medium** | After stage C `ad02f18e` keeps only `AWSPREVIOUS`; a second write would unlabel it while rollback revisions still pin it | **Fixed** in the procedure: "no further write until stage D is verified", the script refuses a second run, optional custom label (owner-approved metadata write) |
| C-3 | Low | No check after the write | **Fixed**: `DescribeSecret` after `PutSecretValue`, prints `CREATED VERIFIED` only if the stages are as expected |
| C-4 | Low | Values not type-checked | **Fixed**: abort unless all five values are non-empty strings |
| C-5 | Low | boto3 availability and the KMS key policy are assumptions; escrow not stated | **Fixed**: `ABORT BOTO3_MISSING`; every exception prints only type and AWS error code; §7 "Escrow and loss" added. boto3 in CloudShell and the key policy stay [U] until Stage R / stage C |
| C-6 | Info | Stage D must run identity-migrate before the service | Already runbook 03 §7 step 3 |

**No Critical, High or Medium finding remains open.** One Low (P-L1) is accepted with the rationale above.
