# 07. Owner actions, in order

Claude never asks for an MFA code, recovery code, password, access key, credential, IP address or
secret value in chat. Every item is an AWS console, GitHub-settings or DNS action that needs the
owner's own yes.

## Now (no new image needed)

| # | Action | As | Exact steps | Expected | Send Claude | Rollback | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | IAM Identity Center (O-IAM-1 to 4) | root, console | `infra/aws/identity-center/README.md` §3 | portal URL; one user with MFA; three sets provisioned in `229251310592` | nothing yet | README §6 | US$0 |
| 2 | Verify (O-IAM-5) and move the connector to ReadOnly (O-IAM-6) | ReadOnly, Engineering, root (simulator) | README §5 A, B, C, **C2** and §4 | ARNs `AWSReservedSSO_…`; denials; C every line `explicitDeny`; **C2 no output** | the outputs (no secrets in them) | | US$0 |
| 3 | Docs bootstrap **plan** | **root**, CloudShell Frankfurt | file 02 §3 | `Plan: 2 to add, 3 to change, 0 to destroy.` + `DOCS BOOTSTRAP PLAN VERIFIED, NOT APPLIED` | `~/munaxa-docs-bootstrap/docs-bootstrap-plan.log` | nothing applied | US$0 |
| 3a | Docs bootstrap **apply** (separate yes, after Claude checks 3) | root, same tab | the command the script printed | `Apply complete! Resources: 2 added, 3 changed, 0 destroyed.` | the last 5 lines | re-apply `a04723a` | US$0 until images |
| 4 | Control bundles | Engineering (or root before 1) | file 03 §2 | `BUNDLES VERIFIED`, 2 version ids | the two `version_id` lines | file 03 | none extra |
| 5 | Docs bundles, mail placeholder | Engineering (or root) | file 03 §2 | 3 version ids; `mail_key placeholder`, `control_token placeholder` | ids + the two marker lines | as 4 | none extra |
| 6 | (Optional) GitHub Packages Read grant | GitHub settings | earlier sprint pack item 1 | Claude re-runs identity#19, control#9, work#32 | | remove the grant | none |

## After OpenSSL 3.5.10 (Claude tells you when; file 06)

| # | Action | Stage |
| --- | --- | --- |
| 7 | Approve image publication (`image-release`) for Identity, Control, Docs | 1 |
| 8 | Yes to Apply 1 after Claude shows a plan matching 33 create + 4 replace | 2 |
| 9 | Yes to Apply 2 after Claude shows 42 create + 3 replace | 3 |
| 10 | Set `OPERATOR_CIDRS` in GitHub (your IPv4 `/32`, typed only in GitHub) | 4 |
| 11 | Yes to the Control session; three DNS-only CNAMEs; first Identity sign-in with TOTP enrolment | 5 |
| 12 | Issue the Docs credential; `replace-key CONTROL_PLANE_TOKEN`; yes to the 2-replacement pin apply | 5g, 6a |
| 13 | Yes to the Docs session; `provision-create`/`provision-delete`; Docs CNAME; sign in, licensed route, upload | 6 |
| 14 | (Same yes) `down` and cleanup verification | 7 |
