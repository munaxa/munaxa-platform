# 01. IAM Identity Center status

**Nothing was created or changed in AWS.** Files: `infra/aws/identity-center/` (three inline
policies, `test_permission_sets.py`, `README.md`).

## 1. Policies re-verified (decision D-IAM-1)

| Check | MunaxaAdministrator (1 h) | MunaxaEngineering (4 h) | MunaxaReadOnly (8 h) |
| --- | --- | --- | --- |
| Session duration | set at creation (README O-IAM-4) | same | same |
| Region | management APIs | explicit deny outside `eu-central-1` except global reads (`DenyOutsideFrankfurt`) | read-only |
| Production resources | no workload actions | `DenyEverythingOnProductionTaggedResources` (`Environment` = prod/production, case-insensitive) | no write exists |
| Secrets and KMS | no `GetSecretValue` | allow only the 7 `munaxa-nonprod/<bundle>-??????` custody bundles and `docs-provision/*`; decrypt only the nonprod data key via Secrets Manager; deny elsewhere; no key administration | deny values and decrypt |
| State and CloudTrail buckets | | explicit deny `s3:*` on both state buckets and the org trail bucket | no object reads |
| ECS Exec, SSM | denied | denied | denied |
| IAM, Organizations, Identity Center writes | owner administration only | **explicit deny** on every IAM write family, `organizations:*`, `account:*`, `sso:*`, `identitystore:*` | no write exists |
| Assume roles | `sts:AssumeRoot` (owner) | explicit deny `sts:AssumeRole`, `AssumeRoot`, `AssumeRoleWithWebIdentity` | deny |
| GitHub OIDC provider and roles | | explicit deny on every change (IAM write deny, resource `*`) | |
| AWS connector | | | ReadOnly + `AWSMCPSignInOAuthAccessPolicy` |

No unsafe policy found. The 29 Oct `PowerUserAccess` draft stays rejected (it fails 4 of 4 new tests).

## 2. IC-1 regression coverage added

The 13 existing tests covered the five IC-1 actions on the prod deployer and two boundary actions.
New class `EngineeringIC1Regression` (4 tests) and `OtherSetsNoIAMWrite` (1 test):

| Brief requirement: Engineering cannot | Test |
| --- | --- |
| Update the Production deployer trust | `iam:UpdateAssumeRolePolicy` × 14 principals/policies (prod and nonprod deployers, the session and CI roles, the Docs eu-prod deployer, a task role, the Administrator SSO role, `OrganizationAccountAccessRole`, three boundaries, the OIDC provider, a user, `*`) × 2 Regions → **explicit deny** |
| Attach or modify role policies | `PutRolePolicy`, `AttachRolePolicy`, `DetachRolePolicy`, `DeleteRolePolicy`, `UpdateRole`, `TagRole`, `PassRole`, … (53 IAM write actions in total) → explicit deny on every resource |
| Create new versions of boundary policies | `CreatePolicyVersion`, `SetDefaultPolicyVersion`, `DeletePolicyVersion`, `PutRolePermissionsBoundary`, `DeleteRolePermissionsBoundary` → explicit deny |
| Assume privileged roles | `sts:AssumeRole`, `AssumeRoot`, `AssumeRoleWithWebIdentity` on every privileged ARN → explicit deny |
| Create IAM users or access keys | `CreateUser`, `CreateAccessKey`, `CreateLoginProfile`, `UpdateLoginProfile`, `AttachUserPolicy`, MFA device and SSH/service credentials → explicit deny |
| Access Production secrets or keys | `munaxa-prod/*`, `munaxa-docs/eu-prod/*`, `identity`, `identity-operator` refused; any other key and the nonprod key on a Production tag → explicit deny |
| (structural) | No `Allow` statement may name `iam:`, `sts:`, `sso:`, `identitystore:`, `organizations:`, `account:`, `lambda:`, `cloudformation:` or `*`, or use `NotAction`; only `cloudshell:*` may be service-wide |
| ReadOnly | No IAM write and no assume on the prod deployer, a boundary or `*` |

Mutation evidence ([supporting/ic1-mutation-evidence.txt](supporting/ic1-mutation-evidence.txt)):
dropping any one of `iam:Update*`, `iam:Attach*`, `iam:Create*`, `iam:Set*`, `iam:PassRole`,
`sts:AssumeRole` from the deny, or adding any IAM allow, fails the suite.

Command: `python3 -I -W error -m unittest discover -s infra/aws/identity-center -p 'test_*.py' -v` →
**Ran 18 tests, OK** (local, 21 Nov ~19:20 UTC); runs in CI (`aws-terraform.yml`, unchanged step).

Limit (unchanged, stated plainly): the evaluator is an offline model of IAM. The owner's simulator
checks (README §5 C and the new C2) are the proof in AWS. In one account, Production is **not**
fully isolated for every service; member accounts or a reviewed Production permission set are
required before any Production deployment (blocker B-9).

## 3. Owner instructions (exact steps in `infra/aws/identity-center/README.md`)

| Step | What | Where in README |
| --- | --- | --- |
| O-IAM-1 | Enable the **organization** instance of IAM Identity Center in **Frankfurt** | §3 |
| O-IAM-2 | MFA: every sign-in (always-on), authenticator apps + security keys, register at sign-in | §3 |
| O-IAM-3 | One named user (short user name, not the e-mail address; e-mail = `IDENTITY_OPERATOR_EMAIL`, never sent to Claude), register an authenticator | §3 |
| O-IAM-4 | Create `MunaxaAdministrator` (1 h), `MunaxaEngineering` (4 h), `MunaxaReadOnly` (8 h) with the managed policies and the inline JSON from `main`; assign all three in `229251310592` | §1, §3 |
| O-IAM-5 | Verify caller identity (A, B), negative tests (A, B), simulator escalation checks (C, **new C2**: expects no output at all) | §5 |
| O-IAM-6 | Re-sign the Claude AWS connector in with **MunaxaReadOnly** | §4 |

Rollback: README §6 (remove assignments, delete sets and user, delete the configuration). Root and
GitHub OIDC are unaffected at every point. Cost: US$0.
