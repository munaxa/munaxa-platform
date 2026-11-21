# IAM Identity Center permission sets (management account, interim)

- **Status:** reviewed repository policy for owner decision D-IAM-1 (21 Nov 2026). **Nothing here
  exists in AWS.** Every step below is an owner-executed AWS change that needs its own yes.
- **Why this folder exists:** the 29 Oct 2026 drafts (project files
  `aws-foundation/proposed-2026-10-29/iam/`) were written for member accounts. The workloads are
  still in the management account `229251310592`, and the draft `MunaxaEngineering` would be
  **unsafe there** (finding IC-1 below). This folder holds the versions to use instead, under test.
- **Report:** `docs/aws-migration/agent-reports/2026-11-21-testing-readiness/` (file 02).
- **Design and procedure:** [../OPERATOR-ACCESS.md](../OPERATOR-ACCESS.md).

## 1. Files

| Permission set | AWS managed policies | Inline policy (this folder) | Session |
| --- | --- | --- | --- |
| `MunaxaAdministrator` | none | `MunaxaAdministrator.management.inline.json` (the 29 Oct draft, unchanged: organization, Identity Center, CloudTrail, billing; denies workloads and secret values) | 1 h |
| `MunaxaEngineering` | `ViewOnlyAccess` (**not** `PowerUserAccess`) | `MunaxaEngineering.management-interim.inline.json` | 4 h |
| `MunaxaReadOnly` | `ViewOnlyAccess`, `SecurityAudit`, `AWSMCPSignInOAuthAccessPolicy` | `MunaxaReadOnly.inline.json` (the 29 Oct draft plus more denies, IC-3) | 8 h |

`test_permission_sets.py` checks every allow and deny listed below with an offline model of IAM's
evaluation (CI: "AWS Terraform" → format, validate, mocked plan tests). It is a model, not AWS; the
owner's verification in section 5 is the proof on the real account.

## 2. Findings that shaped these files

| # | Severity | Finding | Fix here |
| --- | --- | --- | --- |
| IC-1 | **High** | The 29 Oct `MunaxaEngineering` allows IAM writes on `role/munaxa-*/*` and `policy/munaxa-*/*`. In this account the GitHub OIDC deployers are `role/munaxa-shared/bootstrap/…` (including `munaxa-shared-deployer-prod`) and the workload boundaries are `policy/munaxa-shared/…`, so the draft would let an Engineering session rewrite the **prod deployer's trust policy** or the **boundary policy**: a path to Production and to full account access. Its "boundary is read-only" deny names `policy/munaxa-boundaries/*`, a path nothing uses | Engineering has **no IAM write at all**; all IAM, Identity Center, Organizations and STS role changes are explicitly denied |
| IC-2 | **High** | The draft pairs that with `PowerUserAccess`, which in the management account reaches every Production-tagged resource, every secret (including Production ones and the Identity operator password) and both Terraform state buckets | `ViewOnlyAccess` plus narrow allows: the seven custody bundles, the Docs one-run provision secret, the nonprod data key only through Secrets Manager, nonprod log contents, CloudShell. Explicit denies on Production-tagged resources, other secrets and keys, state and trail buckets, ECS Exec, Session Manager, and any Region but `eu-central-1` |
| IC-3 | Medium | The draft `MunaxaReadOnly` deny list misses live log streaming (`logs:StartLiveTail`), query results, `logs:Unmask`, RDS log downloads, `BatchGetSecretValue`, image layers, `sts:AssumeRole` (hop into a deployer) and CloudShell | Added |
| IC-4 | Low | Owner custody scripts accepted any caller in the account | Scripts now accept only root or `AWSReservedSSO_MunaxaEngineering_*`, and never print the session (user) name (`scripts/aws/owner/test/test_caller_identity.py`) |

What Engineering can therefore **not** do, by design, and who does it instead:

| Task | Identity |
| --- | --- |
| Docs bootstrap apply (pack item 4: `munaxa-docs/migrate` ECR repository). The Docs bootstrap state is tagged `Environment=Production` and manages the GitHub OIDC provider, CloudTrail and budgets | **root** (break-glass list, OPERATOR-ACCESS.md §6) |
| Platform bootstrap applies (RDS restart stop, any D-B*/H-20 style change) | **root** |
| Terraform plans and applies of the shared stack, image publication, Testing sessions | GitHub OIDC roles through the "AWS Terraform", publish and "AWS Testing session" workflows (unchanged) |
| Identity Center, users, MFA devices, assignments | `MunaxaAdministrator` |
| Looking at anything, Claude's connector | `MunaxaReadOnly` |

Residual risks, stated plainly:
- The Production-tag deny only works for actions that support `aws:ResourceTag`; it is a second
  layer. The first layer is that Engineering has no write permission outside the listed allows.
- `ViewOnlyAccess` lets Engineering and ReadOnly see metadata of Production resources (names,
  sizes, task-definition environment variables that are not secrets). No values.
- Root remains all-powerful. That is AWS's design; it is break-glass only, with MFA and no keys.
- Production separation (ACCESS-POLICY F-6) still requires member accounts or a reviewed
  Production permission set before any Production deployment. Nothing here approves Production.

## 3. Owner steps (O-IAM-1 to O-IAM-4), console, as root

Do these in one sitting (about 30 minutes). Region selector: **Europe (Frankfurt) eu-central-1**
throughout. Nothing here costs money (IAM Identity Center has no charge).

**O-IAM-1 Enable IAM Identity Center.** Console search "IAM Identity Center" → **Enable** →
"Enable with AWS Organizations" (organization instance). Identity source stays **Identity Center
directory**. Expected: Dashboard shows "AWS access portal URL" `https://<something>.awsapps.com/start`.

**O-IAM-2 MFA.** Settings → Authentication → Multi-factor authentication → Configure:
- Prompt users for MFA: **Every time they sign in (always-on)**
- Users can authenticate with: **Security keys and built-in authenticators** and **Authenticator apps**
- If a user does not yet have a registered MFA device: **Require them to register an MFA device at sign in**
- Save.

**O-IAM-3 Your named user.** Users → Add user. Username: a short name, **not your e-mail address**
(it appears in CloudTrail and in script output). E-mail: `IDENTITY_OPERATOR_EMAIL` (your own
address; never send it to Claude). "Send an email to this user with password setup instructions" →
Next → no group → Add user. Open the e-mail, set a password, sign in at the portal URL, register your
authenticator. Expected: Users → you → MFA devices: 1.

**O-IAM-4 Permission sets and assignments.** For each row of section 1: Permission sets → Create
permission set → **Custom permission set** → attach the AWS managed policies of that row → "Create
a custom inline policy" → paste the whole JSON file of that row from `main` (copy from
`https://github.com/munaxa/munaxa-platform/tree/main/infra/aws/identity-center`) → Next → name
exactly `MunaxaAdministrator` / `MunaxaEngineering` / `MunaxaReadOnly`, session duration 1 h / 4 h /
8 h → Create. Then AWS accounts → tick `229251310592` → Assign users or groups → Users → you → all
three permission sets → Submit. Expected: three permission sets "Provisioned" in `229251310592`.

Do **not** attach `PowerUserAccess` or `AdministratorAccess` to any of them. Do not add an
`aws:MultiFactorAuthPresent` condition (Identity Center sessions never carry it; MFA is enforced
at sign-in by O-IAM-2).

## 4. The Claude connector (O-IAM-6)

Re-sign the Claude AWS connector in through the access portal and choose account `229251310592`,
role **`MunaxaReadOnly`**. From then on Claude cannot write anything, read a secret value, decrypt,
read S3 objects or log contents, or open a shell, whatever it is asked to do.

## 5. Verification (O-IAM-5). Paste the outputs to Claude: none contains a secret

All commands are safe even if a policy were wrong: every secret test asks only for the secret's
**name** (`--query Name`), so a mistaken allow would print a name, never a value.

**A. As `MunaxaReadOnly`** (portal → 229251310592 → MunaxaReadOnly → Management console →
CloudShell is denied by design, so use your laptop CLI per OPERATOR-ACCESS.md §3.2, or let Claude
run A1 to A3 through the connector after O-IAM-6):

```bash
aws sts get-caller-identity --query Arn --output text
# expected: arn:aws:sts::229251310592:assumed-role/AWSReservedSSO_MunaxaReadOnly_<16 hex>/<your user name>
aws ecs list-clusters --region eu-central-1 --query 'clusterArns' --output text
# expected: the munaxa-nonprod cluster ARN (works)
aws secretsmanager get-secret-value --region eu-central-1 --secret-id munaxa-nonprod/identity --query Name --output text
# expected: An error occurred (AccessDeniedException) ... explicit deny
aws logs filter-log-events --region eu-central-1 --log-group-name /munaxa/nonprod/identity --limit 1 --query 'events[0].eventId'
# expected: AccessDeniedException (or ResourceNotFoundException if the group does not exist yet; both prove nothing is read)
```

**B. As `MunaxaEngineering`** (portal → 229251310592 → MunaxaEngineering → Management console →
Region Frankfurt → CloudShell):

```bash
aws sts get-caller-identity --query Arn --output text
# expected: arn:aws:sts::229251310592:assumed-role/AWSReservedSSO_MunaxaEngineering_<16 hex>/<your user name>
aws secretsmanager describe-secret --secret-id munaxa-nonprod/control-api --query Name --output text
# expected: munaxa-nonprod/control-api
aws secretsmanager get-secret-value --secret-id munaxa-nonprod/identity-operator --query Name --output text
# expected: AccessDeniedException (not a custody bundle)
aws secretsmanager describe-secret --region us-east-1 --secret-id munaxa-nonprod/control-api --query Name --output text
# expected: AccessDeniedException (explicit deny: Frankfurt only)
curl -fsSLo control-testing-secrets.sh https://raw.githubusercontent.com/munaxa/munaxa-platform/main/scripts/aws/owner/control-testing-secrets.sh
sha256sum control-testing-secrets.sh   # must equal the value in the report's file 03
/bin/bash -p ./control-testing-secrets.sh status
# expected: caller ... AWSReservedSSO_MunaxaEngineering_<16 hex>/<session name not shown>; STATUS OK
```

**C. Escalation checks with the IAM policy simulator** (root, CloudShell, after O-IAM-4; read-only,
changes nothing):

```bash
ENG=$(aws iam list-roles --path-prefix /aws-reserved/sso.amazonaws.com/ \
  --query "Roles[?starts_with(RoleName,'AWSReservedSSO_MunaxaEngineering_')].Arn" --output text)
aws iam simulate-principal-policy --policy-source-arn "$ENG" \
  --action-names iam:UpdateAssumeRolePolicy iam:PutRolePolicy iam:AttachRolePolicy sts:AssumeRole iam:CreateUser iam:CreateAccessKey \
  --resource-arns arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output text
# expected: every line explicitDeny
aws iam simulate-principal-policy --policy-source-arn "$ENG" \
  --action-names iam:CreatePolicyVersion \
  --resource-arns arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output text
# expected: explicitDeny
aws iam simulate-principal-policy --policy-source-arn "$ENG" \
  --action-names secretsmanager:PutSecretValue secretsmanager:GetSecretValue \
  --resource-arns "$(aws secretsmanager describe-secret --secret-id munaxa-nonprod/docs-api --query ARN --output text)" \
  --context-entries ContextKeyName=aws:RequestedRegion,ContextKeyValues=eu-central-1,ContextKeyType=string \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output text
# expected: both allowed
```

**C2. Wider IC-1 regression checks** (same CloudShell, same `$ENG`; read-only). They mirror the
offline test class `EngineeringIC1Regression` (report 2026-11-21-testing-owner-preparation, file 01):
every role, boundary and the GitHub OIDC provider, every IAM write that could widen access.

```bash
for R in arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-prod \
         arn:aws:iam::229251310592:role/munaxa-shared/bootstrap/munaxa-shared-deployer-nonprod-session \
         arn:aws:iam::229251310592:policy/munaxa-shared/munaxa-shared-workload-boundary \
         arn:aws:iam::229251310592:oidc-provider/token.actions.githubusercontent.com; do
  aws iam simulate-principal-policy --policy-source-arn "$ENG" --resource-arns "$R" \
    --action-names iam:DetachRolePolicy iam:DeleteRolePolicy iam:PutRolePermissionsBoundary \
      iam:DeleteRolePermissionsBoundary iam:UpdateRole iam:TagRole iam:PassRole iam:SetDefaultPolicyVersion \
      iam:DeletePolicyVersion iam:UpdateOpenIDConnectProviderThumbprint iam:AddClientIDToOpenIDConnectProvider \
      iam:CreateLoginProfile iam:AttachUserPolicy sts:AssumeRole \
    --query 'EvaluationResults[?EvalDecision!=`explicitDeny`].[EvalActionName,EvalDecision]' --output text
done
# expected: no output at all (every pair is explicitDeny). Any printed line = stop, send it to Claude.
```

If any expectation differs: stop, send Claude the output, and do not use that permission set.
Root still works throughout.

## 6. Rollback

Identity Center → AWS accounts → `229251310592` → remove the assignments → Permission sets →
delete the three sets → Users → delete the user → Settings → Delete IAM Identity Center
configuration. Root is unaffected at every point; GitHub OIDC is unaffected.
