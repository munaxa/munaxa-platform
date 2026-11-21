# 01. Owner decisions

Source: the owner's brief of 21 Nov 2026 16:14 UTC (this thread), which answers the three yes/no
questions of `2026-11-21-aws-native-operator-access/00-EXECUTIVE-SUMMARY.md`.

## 1. D-IAM-1: IAM Identity Center assignments (decided)

| Element | Decision | Where it is reflected |
| --- | --- | --- |
| Operator identity layer | IAM Identity Center, organization instance, `eu-central-1` | `infra/aws/OPERATOR-ACCESS.md` §2, `infra/aws/identity-center/README.md` §3 |
| `MunaxaAdministrator` | Owner only, used only when genuinely required, 1 h | Policy unchanged from 29 Oct (no workloads, no secret values) |
| `MunaxaEngineering` | Engineering and deployment operations, minimum permissions, 4 h | **New management-account policy** (`MunaxaEngineering.management-interim.inline.json` + `ViewOnlyAccess`), because the draft is unsafe here (file 02, IC-1/IC-2). Not broadened: narrower than the draft |
| `MunaxaReadOnly` | Inspection; the Claude/ChatGPT AWS connector, 8 h | Draft plus more denies (IC-3) |
| MFA | Every sign-in | Identity Center setting (README §3, O-IAM-2); no policy condition (it would lock everyone out) |
| Named individual identities, no shared accounts, no long-lived keys | Yes | One user per person; Engineering and every other set deny `iam:CreateUser`/`CreateAccessKey` |
| Root | Break-glass only | OPERATOR-ACCESS.md §6, plus the explicit root list (platform bootstrap, Docs bootstrap) |
| Production in the management account | Engineering gets **no** unrestricted access to Production-tagged resources | No write outside the custody bundles; explicit deny on `Environment` = `prod`/`production` |

**Limitation stated plainly (as the brief requires):** in one account, IAM cannot fully separate
Production from Testing for every service (the tag deny works only where a service supports
`aws:ResourceTag`, and `ViewOnlyAccess` shows Production metadata). The safe alternative applied
here is to give Engineering almost no write permission at all; everything else goes through the
existing GitHub OIDC pipelines (with plan/apply separation and declarations) or root break-glass.
Full separation still needs member accounts or a reviewed Production permission set (ACCESS-POLICY
F-6) before any Production deployment.

## 2. D-OP-1: Munaxa Identity MFA (decided)

`MFA_POLICY=privileged`, `MFA_PRIVILEGED_ROLES=["control-operator-admin","control-operator-viewer"]`.

| Check | Result |
| --- | --- |
| Terraform supports it | Yes: `identity_security_config.mfa_policy` and `mfa_privileged_roles` (`infra/aws/stack/variables.tf` validations, `services.tf` lines 106 and 110 render `MFA_POLICY`/`MFA_PRIVILEGED_ROLES`) [V] |
| The role keys exist | Yes: `munaxa-identity/apps/api/scripts/seed-control-roles.mjs` defines both; Stage E seeded them in Testing (S-6b: admin 10 grants, viewer 5) and assigned `control-operator-admin` to the operator (S-6c) [V, report 2026-11-21-identity-stage-e-session] |
| Effect | The operator's next sign-in to Identity in Testing requires TOTP enrolment, then a code at every sign-in. Control already refuses operator tokens without `mfa: true` when Cloudflare Access is not used |
| Why it is **not** on `main` yet | `nonprod.tfvars` drives every Testing `up`. Changing it now, before the Identity pin, would make the next session plan contain an Identity task-definition replacement, which the session workflow's plan check refuses (it allows switch resources only). It is therefore applied in **Apply 1** together with the Identity image pin, exactly as the pack says (file 07 step 6). Leaving MFA `off` in the meantime has no effect: nothing runs between sessions, and the first operator sign-in only happens in the Control session after Apply 1 |

## 3. Defaults this task applied without asking (routine, reversible)

| # | Default | Reason |
| --- | --- | --- |
| R-1 | Docs bootstrap runs as **root**, not `MunaxaEngineering` | Its state is tagged `Environment=Production` and manages the OIDC provider, CloudTrail and budgets; Engineering must not reach that |
| R-2 | Docs mail: **placeholder** for the first Testing run (A-6) | The design supports it (`docs-testing-secrets.sh` marks the value; Docs starts, mail dead-letters after retries); no Resend domain verification needed now |
| R-3 | Custody scripts accept root or `MunaxaEngineering` only | Brief §4B "validate the expected AWS identity" |
| R-4 | Budget alert addresses for the Docs bootstrap plan are read from the live budgets | Removes the need for the private `terraform.tfvars`; addresses are never printed |
| R-5 | Negative AWS tests ask for a secret's **name** only (`--query Name`) | A mistaken allow can never print a value |
