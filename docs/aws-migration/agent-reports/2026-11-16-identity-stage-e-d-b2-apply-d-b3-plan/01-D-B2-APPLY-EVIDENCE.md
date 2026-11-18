# 01. PR #134 and the D-B2 apply

## 1. PR #134

- **State:** merged by the owner, squash, 16 Nov 2026 12:37:58 UTC.
- **Merge commit on `main`:** `19fa5bc60182f2538268dfff06b45d392ba32deb`. The last PR head was `be46911b36ebd5ba2850db5641bbe56f89b0c793`, and its CI and AWS Terraform PR checks were green (runs 43831421131 and 43831421145).
- **Report on `main`:** `docs/aws-migration/agent-reports/2026-11-15-identity-stage-e-d-b2-bootstrap/` is present, 8 files.
- **Apply script on `main`:** `supporting/d-b2-apply-owner-cloudshell.sh` has SHA-256 `efa8c79385b392020fad7263f395f86d658402d6b00ebb8217039943edd5190a`, the approved value.

## 2. Apply execution (owner, AWS CloudShell, root)

The owner ran the approved one-line command from file 03 §4 of the D-B2 report.

| Item | Value |
| --- | --- |
| Script | Commit `0596a688c043de33e6a7eae8f628f711e6bf6f2f`, `sha256sum -c` OK |
| Arguments | Pin `9752146f48f56972c72fd1808ce240300c2f1196`, plan SHA-256 `c02a40aee93afc0e24b6dd131319d1d6e13d1e074f8b1a8f0777054b98fa8163` |
| Start | 2026-11-16T12:40:00Z |

Step 1 passed every check:

- region `eu-central-1`;
- account `229251310592`;
- caller root;
- no bootstrap lock;
- state object 2026-11-06T16:03:12Z, `aws:kms`;
- `d-b2.tfplan`, `expected.json` and `norm.jq` checksums OK.

Steps 2 to 4:

| Step | Result |
| --- | --- |
| 2 | Terraform 1.16.5 checksum OK, in a temporary work directory |
| 3 | Pin, provider 6.67.0, init without migration, 68 resources |
| 4 | The apply below, then `OK applied 2026-11-16T12:40:33Z` |

Apply output, summarized:

```
aws_iam_policy.workload_boundary["nonprod"]: Modifying...
aws_iam_policy.deployer_session_cleanup[0]: Creating...
aws_iam_policy.deployer_session_read["nonprod"]: Modifying...
aws_iam_policy.deployer_session_cleanup[0]: Creation complete after 0s [.../bootstrap/munaxa-shared-deployer-nonprod-session-cleanup]
aws_iam_role_policy_attachment.deployer_session_cleanup[0]: Creating...
aws_iam_policy.workload_boundary["nonprod"]: Modifications complete after 0s
aws_iam_policy.deployer_session_read["nonprod"]: Modifications complete after 0s
aws_iam_role_policy_attachment.deployer_session_cleanup[0]: Creation complete after 1s
Apply complete! Resources: 2 added, 2 changed, 0 destroyed.
```

These are exactly the four approved addresses and actions.

## 3. State and post-apply plan

| Check | Result |
| --- | --- |
| Resources before the apply | 68 |
| Post-apply plan, `-var testing_session_cleanup=true -detailed-exitcode` | `No changes. Your infrastructure matches the configuration.` (exit 0) |
| Resources after the apply | 70 |
| Lock after the run | None |
| New state object | 2026-11-16T12:40:34Z |
| Script result line | `D-B2 APPLIED AND VERIFIED 2026-11-16T12:40:59Z` |

## 4. Live IAM verification (read-only, in the same script)

- **Normalized policies:** each was compared with the reviewed expected policy written by the plan script (`expected.json`, SHA-256 `b1b1048e…e3b8`).
  - `munaxa-shared-workload-boundary` equals `boundary_after`. It adds `TestingSessionCleanup` and `TestingSessionCleanupLookups`.
  - `bootstrap/munaxa-shared-deployer-nonprod-session-read` equals `session_read_after`. It adds `RefreshSessionCleanup`.
  - `bootstrap/munaxa-shared-deployer-nonprod-session-cleanup` equals `cleanup_after`. It has 4 statements.
- **Managed policies of `munaxa-shared-deployer-nonprod`:**
  - `-allow`
  - `-allow-tagged`
  - `-session-cleanup`
  - `munaxa-shared-deployer-read`

  That is 4 policies, against a quota of 10.

Claude reviewed the owner's full output line by line and found no deviation from the approved scope.
