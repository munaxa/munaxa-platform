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

## 3. Real plan (owner CloudShell): PENDING

To be filled from the owner's log. Claude checks:

1. The script's own result line, and that every step printed `OK`.
2. The pin, the account, the root caller, and the region.
3. The state object version, 68 resources, and no lock.
4. The exact summary line and the four address lines.
5. The added statements printed in step 10 equal file 04, character for character.
6. Policy sizes: expected about 3,871, 1,470 and 1,028 characters (rendered offline).
7. The plan file SHA-256, which the apply script will require.

Then the result is either `D-B2 PLAN VERIFIED — READY FOR OWNER APPROVAL` or
`D-B2 BLOCKED — NO APPLY PERFORMED`.
