# 06. Apply result (19 Nov 2026, 11:28 UTC)

**Status: APPLIED AND VERIFIED.** The owner approved the apply at 11:08 UTC, using the decision card "Apply the reviewed H-20 permissions plan (fingerprint 11173079…6f09)?". The owner then ran `h20-iam-apply-owner-cloudshell.sh` in CloudShell, after checking its SHA-256 `23f0a673…a3bd` (`OK`). The run started at 11:28:09 UTC.

## 1. Owner apply log (pasted in the thread at 11:29 UTC)

| Step | Log | Result |
| --- | --- | --- |
| Identity and lock | `eu-central-1`, `229251310592`, root, no lock | PASS |
| Saved plan | `h20-iam.tfplan: OK` against `11173079…6f09`; `expected.json` and `norm.jq` OK | PASS |
| Source | PIN `0f06836…`, provider 6.67.0, init without migration, 70 resources | PASS |
| Apply | `aws_iam_policy.deployer_session_read["nonprod"]: Modifying…`, `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`, applied at 11:28:43 UTC | PASS |
| Post-apply plan (`-var testing_session_cleanup=true -detailed-exitcode`) | `No changes. Your infrastructure matches the configuration.`; 70 resources | PASS |
| Live IAM | boundary, session-read and session-cleanup equal the reviewed code | PASS |
| End | no lock left; state object 11:28:44 UTC, version `wqHXQxbe…`; saved plan deleted; `H-20 IAM APPLIED AND VERIFIED 2026-11-19T11:29:07Z` | PASS |

## 2. Claude's independent read-only check (11:29:43 UTC, AWS connector)

- **Session-read policy.** The default version is now **v4**, updated 11:28:43 UTC. Versions v1 to v4 are stored, so the five-version limit is not reached.
  - Its statements: `RefreshOwnKeys`, `RefreshOwnSecretContainers`, `RefreshOwnBuckets`, `RefreshOwnRoles`, `RefreshSessionCleanup`, `GateSessionCleanup`.
  - Size: 1,798 characters.
- **`GateSessionCleanup`.** Allow `states:ListExecutions` and `states:DescribeExecution`, on exactly `arn:aws:states:eu-central-1:229251310592:stateMachine:munaxa-nonprod-session-cleanup` and `arn:aws:states:eu-central-1:229251310592:execution:munaxa-nonprod-session-cleanup:*`.
- **Every other Munaxa policy kept its default version and update time**, compared with the read at 11:08:53 UTC just before the apply:

  | Policy | Default version | Last updated |
  | --- | --- | --- |
  | prod `deployer-prod-allow` | v3 | 6 Nov |
  | prod `deployer-prod-allow-tagged` | v1 | 5 Nov |
  | prod `workload-boundary-prod` | v2 | 5 Nov |
  | `deployer-read` | v1 | 5 Nov |
  | `workload-boundary` | v4 | 16 Nov |
  | `deployer-nonprod-allow` | v3 | 6 Nov |
  | `deployer-nonprod-allow-tagged` | v1 | 5 Nov |
  | `deployer-nonprod-session-cleanup` | v1 | 16 Nov |

  **No production policy changed.**
- **CloudTrail.** A lookup of IAM write events since 11:20 UTC returned none yet. CloudTrail delivers events with a delay of up to about 15 minutes. The check is repeated after R tonight (§3).

## 3. Remaining verification (after tonight's R)

- **R runs at 21:05 UTC.** After it succeeds, Claude runs the H-20 gate read-only. It must PASS.
  - `last_success_was_real` must become true once R is the latest success.
  - The other 7 conditions must still be true.
- **CloudTrail must show only `CreatePolicyVersion` on the nonprod session-read policy** at about 11:28:43 UTC.
- **The workflow gate also needs a real session**, with `hard_stop_utc` and an armed P and S. That is a separate owner decision. It is not authorized here, and neither is Stage E.
