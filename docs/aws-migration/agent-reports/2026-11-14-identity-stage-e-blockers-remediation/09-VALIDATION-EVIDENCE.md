# Validation evidence

## 1. Commits

| SHA | Content |
| --- | --- |
| 68fa6f9 | base, `origin/main` |
| d290be1 | BE-2 cleanup (gated, unapplied) and BE-8 Option A connector scripts |
| 05ecaf3 | BE-3/BE-4 throwaway-account probe mode and MFA checks |
| 484387b | BE-1 manifest, E-1 guard, runbook corrections |
| a82b160 | BE-2 H-20 gate and arm; CI runs the Python tests |
| 6fc37c4 | review fixes (C-1, S-1 … C-10) |
| 8f28a61 | fix-check findings N-1, N-2; prettier formatting of changed files |
| (report commit) | this folder, README row, first-session checklist (`run_one` steps replaced by E-1) |

Diff from 68fa6f9 to 8f28a61: 34 files, 8,415 insertions, 68 deletions.

## 2. File fingerprints at 8f28a61 (first 16 hex of SHA-256)

| File | SHA-256 prefix |
| --- | --- |
| `infra/aws/stack/scripts/identity-probe-loader.mjs` | `0e391c1d51906239` (full value is the manifest's `loaderSha256`) |
| `scripts/aws/connector/c8-create-operator-secrets.py` | `646cba4909eb2449` |
| `scripts/aws/connector/c8r-recover-operator-secrets.py` | `ef7e7758fe78dde8` |
| `scripts/aws/connector/c8v-verify-operator-secrets.py` | `4ae69964498572d4` |
| `scripts/aws/connector/c16-delete-bootstrap-secret.py` | `e88ffb30d516bbc1` |
| `scripts/aws/connector/c24-custody-cloudtrail-check.py` | `0b493d64164d9fec` |
| `scripts/aws/connector/e1-task-guard.py` | `2b7f80a0b488c292` |
| `scripts/aws/connector/h20-session-cleanup-gate-and-arm.py` | `91c634918c695f2b` |

Before running any connector script in Stage E, the operator compares the session copy with the
file on main (the scripts are pasted with only their `INPUT` lines changed).

## 3. Secret scan

Method: the full branch diff, the uncommitted documentation and every report file were scanned for
email addresses, AWS access key ids (`AKIA…`, `ASIA…`), PEM private keys and GitHub tokens.

| Check | Result |
| --- | --- |
| Email addresses | only synthetic (`.invalid`, `example.*`, `munaxa-synthetic.net`), plus the budget recipients already on main (`infra/aws/bootstrap/variables.tf` default, quoted by an existing test); the Testing operator email appears nowhere (placeholder `<IDENTITY_OPERATOR_EMAIL>` only) |
| AWS access key ids | 0 |
| Private keys | 0 (test public-key placeholders only) |
| GitHub tokens | 0 |
| Em dash in AWS names or descriptions | none (the only em dash in code is a test assertion) |

`test_connector_scripts.py` also fails if a committed `INPUT` line holds a real-looking value, and
checks every script result for planted email, password and secret values.

## 4. Documentation checks

- Every relative link in files 00 to 09 and the README row resolves to a file on the branch.
- Every table in files 00 to 09 has the same column count in each row.
- The README index has one new top row for this folder.

## 5. No AWS action

No AWS connector call, AWS CLI call, Terraform plan against a backend, apply, workflow dispatch,
deployment, image publication, secret access, merge or repository-settings change was made. The
offline wrapper removed credentials for every Terraform and Python run; no tool attempted an AWS
call. Stage E was not started.
