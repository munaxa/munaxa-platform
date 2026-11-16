# 03. Plan review

## 1. Expected plan (from source, offline)

`Plan: 2 to add, 2 to change, 0 to destroy.`

| Address | Action | Attribute |
| --- | --- | --- |
| `aws_iam_policy.workload_boundary["nonprod"]` | update in place | `policy` only |
| `aws_iam_policy.deployer_session_read["nonprod"]` | update in place | `policy` only |
| `aws_iam_policy.deployer_session_cleanup[0]` | create | name `munaxa-shared-deployer-nonprod-session-cleanup`, path `/munaxa-shared/bootstrap/` |
| `aws_iam_role_policy_attachment.deployer_session_cleanup[0]` | create | role `munaxa-shared-deployer-nonprod` |

No prod address changes: the boundary and session-read changes are gated on `each.key ==
"nonprod"`, and the new policy and attachment exist only for nonprod. The prod boundary
`munaxa-shared-workload-boundary-prod` renders identically with the flag on and off.

## 2. Offline evidence

- An offline targeted plan of the three policies was rendered twice at `9752146`, once with each flag value. It used Terraform 1.16.5, AWS provider 6.67.0, no credentials, and endpoints pointed at 127.0.0.1.
  - Flag false: the boundary and session-read policies match the 6 Nov code.
  - Flag true: they gain only the statements in file 04, and the cleanup policy appears.
- Bootstrap Terraform tests at `9752146`: 14 passed, 0 failed. They include `be2_session_cleanup_is_off_by_default` and `be2_session_cleanup_widens_only_nonprod`.
- These renders are not an AWS plan. They prove what the code produces, not what AWS holds.

## 3. Real plan (owner CloudShell, 16 Nov 2026 08:22 to 08:24 UTC): VERIFIED

The owner ran script revision 2 (commit `3d0cdd1`, SHA-256 `67583797…4855e7`), and its checksum passed in CloudShell.

Before that run, the CloudShell home folder (1 GB) was full. The owner deleted only `~/bootstrap/.terraform/providers`, a provider cache from the 6 Nov apply that can be downloaded again. Free space went from 36 KB to 789 MB. The state is in S3 and was not touched.

Claude reviewed the owner's log independently against the seven checks.

| # | Check | Owner log | Result |
| --- | --- | --- | --- |
| 1 | Result line, every step OK | `D-B2 PLAN VERIFIED, NOT APPLIED 2026-11-16T08:24:04Z`. Steps 1 to 11 all `OK`, no `STOP` | PASS |
| 2 | Pin, account, caller, region | Pin `9752146f…1196`, account `229251310592`, caller root, `eu-central-1` | PASS |
| 3 | State, lock | State object 2026-11-06 16:03:12 UTC, `aws:kms`, unchanged since the 6 Nov apply. 68 resources. No lock before or after | PASS |
| 4 | Summary and addresses | `Plan: 2 to add, 2 to change, 0 to destroy.` Exactly the 4 addresses and actions of §1. 0 deletes, 0 replacements, no prod address. The updates change only `policy` | PASS |
| 5 | Statements | See the notes below the table | PASS |
| 6 | Sizes | 3,871, 1,470 and 1,028 characters, equal to the offline render. All under 6,144 | PASS |
| 7 | Plan file | `d-b2.tfplan` SHA-256 `c02a40aee93afc0e24b6dd131319d1d6e13d1e074f8b1a8f0777054b98fa8163`. `d-b2.plan.json` SHA-256 `4d652cd2bf6424325765b39be9fb1d0909a8b76a43d6e03e04de833d314b6a12` | Recorded. The apply script requires the first |

Notes on check 5:

- The before-policies equal the 6 Nov code, so there is no drift.
- The log printed 7 statements: 3 added to existing policies and 4 in the new policy.
- Claude compared them with the offline render. After normalization they are identical, character for character.
- Nothing is removed or changed.
- The attachment role is `munaxa-shared-deployer-nonprod`.

Other facts from the log:

- `terraform test`: 14 passed, 0 failed.
- `init` ran with the lock file read-only and without a state migration.
- The cleanup policy did not exist yet.
- The nonprod deployer has 3 managed policies today and will have 4 after the apply, against a quota of 10.

**Result: D-B2 PLAN VERIFIED — READY FOR OWNER APPROVAL.**

## 4. Apply procedure (prepared, NOT run, needs the owner's explicit approval)

The script is `supporting/d-b2-apply-owner-cloudshell.sh`, at commit `0596a688c043de33e6a7eae8f628f711e6bf6f2f`, with SHA-256 `efa8c79385b392020fad7263f395f86d658402d6b00ebb8217039943edd5190a`.

It must run in the same CloudShell, where `~/munaxa-d-b2/d-b2.tfplan` is saved.

```bash
curl -fsSLo ~/munaxa-d-b2/a.sh https://raw.githubusercontent.com/munaxa/munaxa-platform/0596a688c043de33e6a7eae8f628f711e6bf6f2f/docs/aws-migration/agent-reports/2026-11-15-identity-stage-e-d-b2-bootstrap/supporting/d-b2-apply-owner-cloudshell.sh && echo "efa8c79385b392020fad7263f395f86d658402d6b00ebb8217039943edd5190a  $HOME/munaxa-d-b2/a.sh" | sha256sum -c - && bash ~/munaxa-d-b2/a.sh 9752146f48f56972c72fd1808ce240300c2f1196 c02a40aee93afc0e24b6dd131319d1d6e13d1e074f8b1a8f0777054b98fa8163
```

Every check in the script is a hard stop. It runs these steps:

1. **Identity and inputs.**
   - Runs the same region, account, root and lock checks as the plan script.
   - The saved plan's SHA-256 must be `c02a40ae…8163`.
   - `expected.json` and `norm.jq` must be the ones the plan script wrote.
2. **Working copy.**
   - Installs Terraform 1.16.5 in a temporary work directory and checks its checksum.
   - Checks out the pinned clone and checks the provider lock.
   - Runs `init` with the lock file read-only and no migration.
   - Requires 68 resources in state.
3. **Apply.**
   - Runs `terraform apply` on that saved plan file only, with no `-auto-approve`, no `-target` and no new plan.
   - Terraform itself refuses the file if the state has changed since 08:24 UTC.
   - The summary must be `Apply complete! Resources: 2 added, 2 changed, 0 destroyed.`
4. **Post-apply plan.**
   - A new plan with `-var testing_session_cleanup=true -detailed-exitcode` must exit 0, meaning no changes.
   - The state must hold 70 resources.
5. **Live check, read-only.**
   - The live boundary, session-read and new cleanup policies must equal the reviewed code.
   - The cleanup policy must be attached to `munaxa-shared-deployer-nonprod`.
6. **Result.**
   - Prints `D-B2 APPLIED AND VERIFIED`.
   - On any `STOP` after the apply, nothing is retried. Claude reviews the log first.
