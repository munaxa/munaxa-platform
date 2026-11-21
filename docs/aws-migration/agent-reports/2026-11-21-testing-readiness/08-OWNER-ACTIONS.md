# 08. Owner actions, in priority order

Each is an AWS, GitHub-settings or DNS action that needs the owner's own yes. Claude never asks for
an MFA code, recovery code, password, access key, credential, IP address or secret value in chat.

## Now (Session 1; none needs a new image)

| # | Action | Identity | Commands | Expected | Send Claude | Rollback | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Set up IAM Identity Center** (O-IAM-1 to 4) with the **management-account** policies | root (console) | `infra/aws/identity-center/README.md` §3, step by step | access portal URL; one user with MFA; three permission sets provisioned in `229251310592` | nothing yet | README §6 | US$0 |
| 2 | Verify it (O-IAM-5) and move the connector to ReadOnly (O-IAM-6) | ReadOnly, Engineering, root (simulator) | README §5 A, B, C | as listed there (ARNs with `AWSReservedSSO_…`, denials, `explicitDeny` lines) | the outputs (no secrets in them) | | US$0 |
| 3 | **Docs bootstrap plan** (plan only) | **root**, CloudShell | file 04 §3 (`bash docs-bootstrap-migrate-plan-owner-cloudshell.sh f1fca8fd7a9a3e09cada5956bd37ac3b5b9a5aad`) | `Plan: 2 to add, 3 to change, 0 to destroy.` and `DOCS BOOTSTRAP PLAN VERIFIED, NOT APPLIED` | the log file | nothing applied | US$0 |
| 3a | Docs bootstrap apply (after Claude checks the log; separate yes) | root, same CloudShell tab | the apply command printed by the script | `Apply complete! Resources: 2 added, 3 changed, 0 destroyed.` | the last 5 lines | re-apply a04723a | US$0 until images |
| 4 | **Control bundles** | Engineering (or root before item 1) | file 03 §3 | two version ids | the two `version_id` lines | file 03 §3 | none extra |
| 5 | **Docs bundles**, mail placeholder | Engineering (or root) | file 03 §3 | three version ids; `mail_key placeholder`, `control_token placeholder` | ids + marker lines | as 4 | none extra |
| 6 | (Optional, later) GitHub Packages read grant | GitHub settings | sprint pack item 1 | Claude re-runs identity#19, control#9, work#32 | | remove the grant | none |
| 7 | (Optional, not needed now) RDS restart stop | root + "AWS Terraform" | sprint `supporting/rds-restart-stop-enablement.md` | bootstrap 2/2/0, stack 8/1/0 | | documented | cents |

## After OpenSSL 3.5.10 (Session 2; Claude tells you when)

| # | Action | Step in file 07 |
| --- | --- | --- |
| 8 | Approve image publication (`image-release`) for Identity, Control, Docs | 5 |
| 9 | Yes to Apply 1 (Control C-1 + Identity pin + Identity MFA `privileged`), after Claude shows the matching plan | 6 |
| 10 | Yes to Apply 2 (Control C-2 + Docs D-1) | 7 |
| 11 | Set `OPERATOR_CIDRS` in GitHub (your own IPv4 `/32`, typed only in GitHub) | 8 |
| 12 | Yes to the Control session; DNS records; first Identity sign-in with TOTP enrolment | 9 |
| 13 | Issue the Docs credential in the Control portal; store it with `replace-key`; yes to the pin apply | 10, 11 |
| 14 | Yes to the Docs session; `provision-create` / `provision-delete`; Docs DNS; sign in and test | 12 |
| 15 | (Same yes) `down` and cleanup verification | 13 |
