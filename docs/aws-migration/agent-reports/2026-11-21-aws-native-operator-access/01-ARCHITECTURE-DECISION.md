# 01. Architecture decision: AWS-native operator access

**Decision (owner, 21 Nov 2026 15:14 UTC):** AWS is the hosting and infrastructure security platform
for Munaxa. Cloudflare Access must not be required to deploy, operate or reach the first AWS
Testing environment. It supersedes the 29/30 Oct 2026 decision that made Cloudflare Access
(`operator-test.munaxa.com`) the operator access method. Cloudflare stays for DNS, the corporate
website and its other existing uses.

## 1. The model

| Layer | Mechanism | Detail |
| --- | --- | --- |
| AWS infrastructure, people | **AWS IAM Identity Center** (organization instance, `eu-central-1`, Identity Center directory) | One named user per person, MFA at every sign-in, permission sets `MunaxaAdministrator` (1 h), `MunaxaEngineering` (4 h), `MunaxaReadOnly` (8 h) from the 29 Oct design. Console through the access portal; CLI through `aws configure sso`; CloudShell inherits the permission set. The Claude AWS connector uses `MunaxaReadOnly` |
| AWS infrastructure, machines | GitHub OIDC roles (unchanged) | CI, deployer, session deployer, image publishers |
| Root | Break-glass only | MFA on, no keys; listed root-only tasks; bootstrap re-applies that touch the OIDC provider or boundary policies until the permission sets are re-reviewed (ACCESS-POLICY F-3) |
| Private administration | One-off ECS tasks (db-admin, migrate, bootstrap, provision) | No EC2, so no Session Manager target and no bastion; ECS Exec stays off; no Client VPN (no requirement) |
| Monitoring, secrets | CloudWatch; AWS Secrets Manager with owner custody scripts | Unchanged; Claude never reads a value |
| Munaxa applications | **Munaxa Identity** + each product's authorization | Identity Center never signs anyone in to an application |
| Control operator console (an application) | ALB source ranges (`OPERATOR_CIDRS`, never committed) + Munaxa Identity with **MFA required** and the subject allow-list | DNS-only record; 403 to every other source |
| Cloudflare Access | **Optional** extra layer | Code and Terraform still support it; nothing requires it |

Full procedure, verification and break-glass: `infra/aws/OPERATOR-ACCESS.md` (new).

## 2. Why this design

- **Simple and AWS-native:** no new paid service. Identity Center is free; ALB listener-rule
  source conditions already existed in the stack (`operator_cidrs`, Control ADR-0006); MFA comes
  from Identity's TOTP (identity#7), already deployed in Stage E's image.
- **Not weaker than before:** previously Cloudflare Access was the operator's second factor
  (TD-3) because Identity's `mfaSatisfied` was always false. Identity now issues `mfa: true`, so the
  second factor moves into the application layer where it is checked on every operator API call,
  not only at the edge. Control's production startup now **refuses** to run without Access unless
  MFA is required and the allow-list is set, and Terraform refuses Control without Access unless
  Identity's MFA policy is on. The network restriction moves from Cloudflare's edge to the ALB.
- **Separation:** AWS infrastructure access (Identity Center) and application access (Munaxa
  Identity) never share credentials or sign-in.

## 3. The operator endpoint review (brief §3C)

| Endpoint | Purpose | Necessary? | Decision |
| --- | --- | --- | --- |
| `operator-test.munaxa.com` `/*` → control-portal | Munaxa staff create deployments and issue product credentials (item 10 of the pack: the Docs credential) | Yes, for the first Docs deployment | Kept as an **application** endpoint. Not public: ALB forwards it only from `OPERATOR_CIDRS`; Identity MFA + allow-list + permissions in Control |
| `operator-test.munaxa.com` `/api/auth/*` → identity | Same-origin sign-in for the portal | Yes | Same rule (30) and ranges. The same endpoints are public on `id.test.munaxa.com` anyway, so nothing is exposed by it |
| Control admin API `/api/v1/admin/*` | Called by the portal | Yes | Never public: 403 on `control-api.*` (rule 10); reached over Cloud Map only. Unchanged |
| Any AWS administrative endpoint | none exists behind Cloudflare Access | n/a | Nothing to move |

Considered and rejected:
- **Session Manager port forwarding to the portal (no public host at all):** needs ECS Exec on the
  portal, task-role SSM permissions and a localhost sign-in flow that Identity's cookie and redirect
  design does not support. More moving parts, not more security for a staff console that already
  requires MFA and a named allow-list.
- **Client VPN:** charged per subnet association hour and per connection hour (roughly US$0.10
  and US$0.05 an hour, [E], not checked against current pricing); no requirement.
- **Bastion host:** an EC2 instance to patch; no requirement.
- **Committing the operator's IP to `nonprod.tfvars`:** the repository is public; the address is
  passed as the `OPERATOR_CIDRS` environment variable instead.

## 4. Owner decisions this raises

| # | Decision | Recommendation |
| --- | --- | --- |
| D-IAM-1 | Assignments while workloads are in the management account (the 29 Oct design assigns Engineering to the not-yet-created `munaxa-nonprod` account; Administrator there denies workloads) | Owner: Administrator + Engineering + ReadOnly in `229251310592`; connector: ReadOnly only (OPERATOR-ACCESS.md §2.2) |
| D-IAM-2 | When to run O-IAM-1 to O-IAM-6 | Now, in session 1 of the pack (item 2), before the next owner step that writes to AWS |
| D-IAM-3 | Root sign-in alert (CloudTrail rule to the alert address) | Yes, as a later reviewed bootstrap change; not built here |
| D-OP-1 | Identity MFA policy for Testing | `privileged` with `control-operator-admin` and `control-operator-viewer` (applied with the Identity pin in item 8) |
