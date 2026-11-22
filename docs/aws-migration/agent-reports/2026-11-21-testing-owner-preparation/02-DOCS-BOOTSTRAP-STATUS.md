# 02. Docs bootstrap status

**Offline only. Terraform apply was not run; no AWS resource was read or changed.**

## 1. Expected delta (unchanged, re-verified)

**2 add, 3 change, 0 destroy, 0 replace**, exactly these five addresses:

| Address | Action | Change |
| --- | --- | --- |
| `aws_ecr_repository.images["migrate"]` | create | `munaxa-docs/migrate`, IMMUTABLE, scan on push |
| `aws_ecr_lifecycle_policy.images["migrate"]` | create | untagged after 7 days, newest 20 `sha-*` kept |
| `aws_iam_role_policy.image_publisher` | update | `policy` only: adds `arn:aws:ecr:eu-central-1:229251310592:repository/munaxa-docs/migrate` |
| `aws_iam_policy.image_publisher_boundary` | update | same single ARN |
| `aws_iam_policy.workload_boundary` | update | same single ARN |

Re-verified this session against munaxa-docs `main` (still `f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad`):
`git diff --name-only a04723a f1fca8f -- infra/terraform/bootstrap` = `ecr.tf` only; `ecr.tf` blob
`a4f6f1f5…898b`; provider lock 6.67.0 `h1:EB9ixYOZ…3t4=`; backend bucket/key match. New fact: the
bootstrap was applied by root from `72cbc8e` (head of munaxa-docs#141, recorded in #142
`85a8acf`); its bootstrap tree is **identical** to `a04723a` (`git diff --stat` empty), so the
offline baseline is the applied code. The budgets read on 6 Nov and 19 Nov show both Docs bootstrap
budgets at the code default US$10, so no budget update is expected. Terraform 1.16.5 zip SHA-256
`2bc2fcff…aab5e4` re-checked against HashiCorp's `SHA256SUMS` [V].

## 2. Owner plan script: requirement check

Canonical location now `scripts/aws/owner/docs-bootstrap-migrate-plan-owner-cloudshell.sh` (CI runs
`shellcheck` and the tests on it). CI's `shellcheck` (first run on this script, job 136958660684) flagged SC2164 (`cd
infra/terraform/bootstrap` unchecked: the script runs with `set -u` but not `-e`, so a failed `cd`
would have continued; the later checks would still have failed closed) and two SC2015 notes. Fixed
with explicit `if … then stop` and `cd … || stop`; nothing else changed. New SHA-256
**`0b61f4a2729badf01f2d518b4a881f03914660a8ba04c8d0bb970fb9d88df70b`** (supersedes `1dc70ce4…3845` in the previous report's copy, which stays as history). **22 Nov: superseded by `7a9c5cdceb0c16c18fe531573e4a20fadc7953d3187f221272c9f6ed9479ffb0` (known refresh drift accepted, file 10).**

| Brief requirement | Script | Test (`scripts/aws/owner/test/test_docs_bootstrap_plan.py`) |
| --- | --- | --- |
| Checks the account | §1 stops with `account is <id>` | `test_wrong_account` (only the STS call made) |
| Checks the Region | `AWS_REGION` must be `eu-central-1` | `test_wrong_region` (unset and us-east-1; no call made) |
| Requires root | ARN must equal `arn:aws:iam::229251310592:root` | `test_engineering_and_other_callers_refused` (Engineering, Administrator, an IAM user) |
| Pinned munaxa-docs commit and reviewed ECR configuration | pin argument, detached checkout, on `main`, bootstrap diff = `ecr.tf` only, blob check | `test_wrong_pin_argument`, `test_other_bootstrap_file_changed_since_applied`, `test_ecr_blob_must_match`, `test_real_constants` |
| Provider lock | version and hash grep | `test_real_constants` |
| Budget metadata without printing addresses | read from both live budgets, must match, only a count printed | `test_budget_addresses_differ_and_are_not_printed`; every test asserts no address in output or log |
| Saved plan | `-out=` | `test_reviewed_delta_is_verified_and_nothing_is_applied` |
| Exact addresses and actions | expected list diff | `test_unexpected_address_or_action` (replace, extra update, missing create, delete) |
| Attribute and policy delta | only `policy` changes; before = after minus the migrate ARN; ARN exactly once | `test_attribute_other_than_policy`, `test_policy_delta_must_be_exactly_the_migrate_arn` (extra ARN, ARN twice, widened action, ARN replaced), `test_update_that_changes_nothing_is_refused` |
| Repository shape | IMMUTABLE, scan on push, name | `test_repository_must_be_immutable_with_scan_on_push` |
| Rejects drift | plan text and `resource_drift` | `test_drift` |
| Summary line | must be exactly `Plan: 2 to add, 3 to change, 0 to destroy.` | `test_plan_summary_other_than_2_3_0`, `test_plan_error_exit` |
| State lock | must be absent before and after | `test_state_lock_present` |
| Terraform binary | HashiCorp SHA-256 | `test_terraform_checksum` |
| Ends without applying | no `apply`, `import`, `state`, `-target`, `-auto-approve` call is ever made; only read-only AWS calls | asserted in every test |
| Prints a separate apply command | yes, for a later owner yes | asserted in the success test |

The harness runs the **real script** end to end with fake `aws`/`terraform`/`curl`/`unzip`/
`sha256sum -c` and a synthetic munaxa-docs repository; only the three commit/blob constants are
substituted, and `test_real_constants` checks those against a real munaxa-docs clone when
`MUNAXA_DOCS_DIR` is set (run locally: pass). Result: **19 tests OK** (local, 21 Nov ~19:30 UTC).
One observation, no change: a policy "update" that changes nothing stops with the attribute message,
not the policy message (still a stop).

## 3. Owner command (root, CloudShell, Frankfurt)

```bash
curl -fsSLO https://raw.githubusercontent.com/munaxa/munaxa-platform/main/scripts/aws/owner/docs-bootstrap-migrate-plan-owner-cloudshell.sh
sha256sum docs-bootstrap-migrate-plan-owner-cloudshell.sh   # must be 7a9c5cdceb0c16c18fe531573e4a20fadc7953d3187f221272c9f6ed9479ffb0 (22 Nov, file 10)
bash docs-bootstrap-migrate-plan-owner-cloudshell.sh f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad
```

Expected last lines: `Plan: 2 to add, 3 to change, 0 to destroy.`, the plan summary JSON, two
SHA-256 lines, `DOCS BOOTSTRAP PLAN VERIFIED, NOT APPLIED <time>`. Send Claude
`~/munaxa-docs-bootstrap/docs-bootstrap-plan.log` (it holds no address or secret). The script then
prints the one apply command; run it **only after a separate yes**, in the same CloudShell tab.
Expected apply result: `Apply complete! Resources: 2 added, 3 changed, 0 destroyed.`

Risk R-B1: if the live bootstrap was ever applied with non-default variables (for example a
break-glass or engineering principal ARN), the plan shows extra changes and the script stops before
anything is applied. Nothing is lost; Claude then reads the log and prepares a corrected
declaration. Rollback after an apply: re-apply the `a04723a` bootstrap (the new repository is empty;
the three policies lose the ARN). Cost: US$0 until an image is pushed.
